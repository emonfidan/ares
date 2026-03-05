// selenium/tests/05_rate_limit_simulation.js
// TC-05: Brute-force escalation — LLM-driven risk assessment on failed logins

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');
const { findWithHealing } = require('../utils/heal');

// Node 18+ has fetch; fallback for older Node if ever needed
const fetchFn = global.fetch || ((...args) =>
  import('node-fetch').then(({ default: f }) => f(...args))
);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3001';
const WAIT_MS = 30000;

const EMAIL = 'clean@example.com';
const WRONG_PW = 'WrongPassword!!!';
const RIGHT_PW = 'Password123!';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setValue(driver, id, value) {
  const el = await driver.wait(until.elementLocated(By.id(id)), WAIT_MS);
  await driver.wait(until.elementIsVisible(el), WAIT_MS);
  await el.clear();
  await el.sendKeys(value);
}

async function hardClick(driver, locator, label) {
  const el = await driver.wait(until.elementLocated(locator), WAIT_MS);
  await driver.wait(until.elementIsVisible(el), WAIT_MS);

  await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", el);
  await sleep(120);

  try { await el.click(); return; } catch { }
  try { await driver.actions({ async: true }).move({ origin: el }).click().perform(); return; } catch { }
  try { await driver.executeScript('arguments[0].click();', el); return; } catch (e) {
    throw new Error(`Could not click ${label}: ${e.message}`);
  }
}

async function tryClickIfExists(driver, id) {
  const els = await driver.findElements(By.id(id));
  if (els.length > 0) {
    try { await hardClick(driver, By.id(id), id); } catch { }
  }
}

async function getMessageText(driver) {
  try {
    const box = await driver.findElement(By.id('message-box'));
    return (await box.getText()) || '';
  } catch {
    return '';
  }
}

async function apiPost(path) {
  const res = await fetchFn(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  let data = null;
  try { data = await res.json(); } catch { }
  return { status: res.status, data };
}

async function apiGet(path) {
  const res = await fetchFn(`${API_BASE}${path}`);
  const data = await res.json();
  return { status: res.status, data };
}

async function getBackendStatus(email) {
  const r = await apiGet(`/api/user/${encodeURIComponent(email)}`);
  if (r.status !== 200 || !r.data?.user) {
    throw new Error(`Backend status fetch failed: ${r.status}`);
  }
  return r.data.user;
}

async function resetAccount(email) {
  const r = await apiPost(`/api/admin/reset/${encodeURIComponent(email)}`);
  if (r.status !== 200) throw new Error(`Reset failed: HTTP ${r.status}`);
}

(async function tc05() {
  console.log('▶ TEST 05 (Brute Force Escalation — LLM-Driven) starting...');
  const driver = buildDriver();

  try {
    // Reset to deterministic state
    console.log('↺ Resetting account...');
    await resetAccount(EMAIL);

    const before = await getBackendStatus(EMAIL);
    console.log(`Backend after reset: ${before.accountStatus}, failedAttempts=${before.failedAttempts}`);

    await driver.get(FRONTEND_URL);

    // Ensure login tab (if your UI has it)
    await tryClickIfExists(driver, 'login-tab');

    await setValue(driver, 'identifier', EMAIL);

    // Track state transitions across attempts
    let sawChallenged = false;
    let sawSuspended = false;
    const verdicts = [];

    // 10 wrong attempts — spaced to avoid backend 8/30s rate limiter
    for (let attempt = 1; attempt <= 10; attempt++) {
      console.log(`--- Wrong Attempt ${attempt} ---`);

      await setValue(driver, 'password', WRONG_PW);

      await findWithHealing(driver, By.id('login-button'), [], WAIT_MS, { intent: 'login-button' });
      await hardClick(driver, By.id('login-button'), 'login-button');

      await sleep(1500); // Extra time for LLM API call

      const uiMsg = (await getMessageText(driver)).replace(/\s+/g, ' ').trim();
      const st = await getBackendStatus(EMAIL);

      console.log(`UI: "${uiMsg}"`);
      console.log(`Backend: status=${st.accountStatus}, failedAttempts=${st.failedAttempts}`);

      // Track state transitions
      if (st.accountStatus === 'Challenged') sawChallenged = true;
      if (st.accountStatus === 'Suspended') sawSuspended = true;
      verdicts.push(st.accountStatus);

      // If already Suspended, the account is blocked — no point continuing attempts
      if (st.accountStatus === 'Suspended') {
        console.log(`Account suspended at attempt ${attempt}. Stopping brute-force loop.`);
        break;
      }

      // spacing avoids 429
      if (attempt < 10) await sleep(4000);
    }

    console.log(`\nState transitions observed: [${verdicts.join(' → ')}]`);
    console.log(`Saw Challenged: ${sawChallenged}, Saw Suspended: ${sawSuspended}`);

    // The LLM must have escalated at some point during 10 failed attempts.
    // With the risk scoring:
    //   - At 6 failed attempts: score = 30 (MEDIUM) → LLM is invoked
    //   - The LLM should respond with CHALLENGE or BLOCK given accumulating failures
    // We require that the account reached at least Challenged OR Suspended.
    if (!sawChallenged && !sawSuspended) {
      throw new Error(
        'Expected the LLM to escalate to Challenged or Suspended during brute-force, ' +
        `but account remained in: [${verdicts.join(', ')}]`
      );
    }

    // After brute-force, correct password should be denied if Suspended
    const currentStatus = await getBackendStatus(EMAIL);
    if (currentStatus.accountStatus === 'Suspended') {
      console.log('Account is Suspended — verifying correct password is denied...');
      await setValue(driver, 'password', RIGHT_PW);
      await hardClick(driver, By.id('login-button'), 'login-button');
      await sleep(700);

      const afterMsg = (await getMessageText(driver)).replace(/\s+/g, ' ').trim();
      const after = await getBackendStatus(EMAIL);

      console.log(`UI after correct pw: "${afterMsg}"`);
      console.log(`Backend after correct pw: status=${after.accountStatus}`);

      if (after.accountStatus !== 'Suspended') {
        throw new Error(`Expected Suspended after correct-password attempt, got ${after.accountStatus}`);
      }
    } else if (currentStatus.accountStatus === 'Challenged') {
      console.log('Account is Challenged — LLM escalated but did not fully block.');
      console.log('This is acceptable: the LLM decided CHALLENGE rather than BLOCK.');
    }

    console.log('TEST 05 PASSED.');

    // Clean up: reset account so TC-05 leaves the system in a fresh state
    console.log('↺ Post-test cleanup reset...');
    await resetAccount(EMAIL);

    const cleaned = await getBackendStatus(EMAIL);
    console.log(`Backend after cleanup: ${cleaned.accountStatus}, failedAttempts=${cleaned.failedAttempts}`);
  } catch (err) {
    console.error('TEST 05 FAILED:', err.message);
    throw err;
  } finally {
    await driver.quit();
  }
})();

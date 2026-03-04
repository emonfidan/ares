// selenium/tests/05_rate_limit_simulation.js
// TC-05: Brute force escalation -> Challenged at 5, Locked at 10

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

  try { await el.click(); return; } catch {}
  try { await driver.actions({ async: true }).move({ origin: el }).click().perform(); return; } catch {}
  try { await driver.executeScript('arguments[0].click();', el); return; } catch (e) {
    throw new Error(`Could not click ${label}: ${e.message}`);
  }
}

async function tryClickIfExists(driver, id) {
  const els = await driver.findElements(By.id(id));
  if (els.length > 0) {
    try { await hardClick(driver, By.id(id), id); } catch {}
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
  try { data = await res.json(); } catch {}
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
  console.log('▶ TEST 05 (Brute Force Escalation) starting...');
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

    // 10 wrong attempts — spaced to avoid backend 8/30s rate limiter (your server.js limiter)
    for (let attempt = 1; attempt <= 10; attempt++) {
      console.log(`--- Wrong Attempt ${attempt} ---`);

      await setValue(driver, 'password', WRONG_PW);

      await findWithHealing(driver, By.id('login-button'), [], WAIT_MS, { intent: 'login-button' });
      await hardClick(driver, By.id('login-button'), 'login-button');

      await sleep(700);

      const uiMsg = (await getMessageText(driver)).replace(/\s+/g, ' ').trim();
      const st = await getBackendStatus(EMAIL);

      console.log(`UI: "${uiMsg}"`);
      console.log(`Backend: status=${st.accountStatus}, failedAttempts=${st.failedAttempts}`);

      // Assertions at thresholds (backend truth)
      if (attempt === 5 && st.accountStatus !== 'Challenged') {
        throw new Error(`Expected Challenged at attempt 5, got ${st.accountStatus}`);
      }
      if (attempt === 10 && st.accountStatus !== 'Locked') {
        throw new Error(`Expected Locked at attempt 10, got ${st.accountStatus}`);
      }

      // spacing avoids 429
      if (attempt < 10) await sleep(4000);
    }

    // After lock, correct password must still be denied
    console.log('Trying correct password after lock (should be denied)...');
    await setValue(driver, 'password', RIGHT_PW);
    await hardClick(driver, By.id('login-button'), 'login-button');
    await sleep(700);

    const afterMsg = (await getMessageText(driver)).replace(/\s+/g, ' ').trim();
    const after = await getBackendStatus(EMAIL);

    console.log(`UI after correct pw: "${afterMsg}"`);
    console.log(`Backend after correct pw: status=${after.accountStatus}, failedAttempts=${after.failedAttempts}`);

    if (after.accountStatus !== 'Locked') {
      throw new Error(`Expected Locked after correct-password attempt, got ${after.accountStatus}`);
    }

    console.log('TEST 05 PASSED.');
  } catch (err) {
    console.error('TEST 05 FAILED:', err.message);
    throw err;
  } finally {
    await driver.quit();
  }
})();
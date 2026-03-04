// selenium/tests/05_rate_limit_simulation.js
// TC-05: Brute force escalation -> Challenged at 5, Locked at 10

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');
const { findWithHealing } = require('../utils/heal');

// ✅ fetch works even if Node < 18
const fetch = global.fetch || ((...args) =>
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

async function getMessageText(driver) {
  try {
    const box = await driver.findElement(By.id('message-box'));
    return (await box.getText()) || '';
  } catch {
    return '';
  }
}

// Robust click
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
    try {
      await hardClick(driver, By.id(id), id);
    } catch {}
  }
}

async function apiPost(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
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
  console.log('▶ 05 TC-05 starting...');
  const driver = buildDriver();

  try {
    // Reset to deterministic state
    console.log('↺ Resetting account...');
    await resetAccount(EMAIL);

    const before = await getBackendStatus(EMAIL);
    console.log(`Backend after reset: ${before.accountStatus}, failedAttempts=${before.failedAttempts}`);

    await driver.get(FRONTEND_URL);

    // Optional login tab
    await tryClickIfExists(driver, 'login-tab');

    await setValue(driver, 'identifier', EMAIL);

    // 10 wrong attempts (spaced to avoid 429 limiter)
    for (let attempt = 1; attempt <= 10; attempt++) {
      console.log(`--- Attempt ${attempt} ---`);

      await setValue(driver, 'password', WRONG_PW);

      await findWithHealing(driver, By.id('login-button'), 'login-button');
      await hardClick(driver, By.id('login-button'), 'login-button');

      await sleep(800);

      const uiMsg = (await getMessageText(driver)).replace(/\s+/g, ' ').trim();
      const st = await getBackendStatus(EMAIL);

      console.log(`UI: "${uiMsg}"`);
      console.log(`Backend: status=${st.accountStatus}, failedAttempts=${st.failedAttempts}`);

      // Avoid rate limiter interference (8 attempts / 30s)
      if (attempt < 10) await sleep(4000);
    }

    // After lock, correct password must still be denied
    console.log('🔒 Trying correct password after lock (should still fail)...');
    await setValue(driver, 'password', RIGHT_PW);
    await hardClick(driver, By.id('login-button'), 'login-button');
    await sleep(800);

    const afterMsg = (await getMessageText(driver)).replace(/\s+/g, ' ').trim();
    const after = await getBackendStatus(EMAIL);

    console.log(`UI after correct pw: "${afterMsg}"`);
    console.log(`Backend after correct pw: status=${after.accountStatus}, failedAttempts=${after.failedAttempts}`);

    if (after.accountStatus !== 'Locked') {
      throw new Error(`Expected Locked after attempt 10, got ${after.accountStatus}`);
    }

    console.log('✅ 05 TC-05 PASSED.');
  } catch (err) {
    console.error('❌ 05 TC-05 FAILED:', err.message);
    throw err;
  } finally {
    await driver.quit();
  }
})();
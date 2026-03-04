// selenium/tests/04_social_auth_handshake.js
// TEST 4: Social Auth Handshake (E2E bypass mode)
// Goal: Click "Continue with Google" -> backend handshake -> land on dashboard
// Works even if a Google popup opens (closes it and continues)

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');
const { findWithHealing } = require('../utils/heal');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const WAIT_MS = 25000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeGetText(driver, by) {
  try {
    const el = await driver.findElement(by);
    return await el.getText();
  } catch {
    return null;
  }
}

(async function socialAuthHandshakeE2E() {
  console.log('▶ TEST 4 (Social Auth Handshake - E2E): starting...');
  const driver = buildDriver();

  try {
    // E2E mode flag for frontend
    await driver.get(`${FRONTEND_URL}/?e2e=1`);

    // Wait for Google button
    await driver.wait(until.elementLocated(By.id('google-login-button')), WAIT_MS);

    // Track existing windows (so we can detect popup)
    const beforeHandles = await driver.getAllWindowHandles();

    // Click Google
    await findWithHealing(driver, By.id('google-login-button'), 'google-login-button');
    const googleBtn = await driver.findElement(By.id('google-login-button'));
    await googleBtn.click();

    // If popup opened, close it (E2E mode shouldn't need it)
    await sleep(1200);
    const afterHandles = await driver.getAllWindowHandles();

    if (afterHandles.length > beforeHandles.length) {
      const newHandle = afterHandles.find((h) => !beforeHandles.includes(h));
      if (newHandle) {
        console.log('ℹGoogle popup detected; closing it (E2E mode).');
        await driver.switchTo().window(newHandle);
        await driver.close();
        await driver.switchTo().window(beforeHandles[0]);
      }
    }

    // Some flows may show challenge overlay—handle it if present
    const challengePresent = await driver
      .findElements(By.id('challenge-verify-btn'))
      .then((els) => els.length > 0);

    if (challengePresent) {
      console.log('ℹ️ Challenge overlay detected; clicking verify.');
      const verifyBtn = await driver.findElement(By.id('challenge-verify-btn'));
      await verifyBtn.click();
    }

    // Wait for Dashboard logout button (proof we landed)
    await driver.wait(until.elementLocated(By.id('logout-button')), WAIT_MS);

    console.log('TEST 4 PASSED (E2E social auth handshake).');
  } catch (err) {
    // Debug info so you can see why it didn't transition
    const currentUrl = await driver.getCurrentUrl().catch(() => null);
    const msg = await safeGetText(driver, By.id('message-box'));
    console.error('TEST 4 FAILED:', err.message);
    console.error('Debug URL:', currentUrl);
    if (msg) console.error('Debug message-box:', msg);
    throw err;
  } finally {
    await driver.quit();
  }
})();
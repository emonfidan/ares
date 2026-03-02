// selenium/tests/05_rate_limit_simulation.js
// Scenario 5: Rate limit simulation (brute force)
// Goal:
// 1) Rapid failed logins trigger 429 (UI shows cooldown message)
// 2) Wait until cooldown expires AND the Login button becomes enabled
// 3) Login with correct credentials
// 4) If CHALLENGE appears, click VERIFY
// 5) Confirm Dashboard (logout button)

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');
const { findWithHealing } = require('../utils/heal');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const WAIT_MS = 30000;

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

function parseRetrySeconds(msg) {
  // Matches: "Please try again in 25 seconds."
  const m = String(msg).match(/try again in\s+(\d+)\s*seconds?/i);
  return m ? Number(m[1]) : null;
}

function isRateLimitMessage(msg) {
  const s = String(msg).toLowerCase();
  return s.includes('too many login attempts') || s.includes('try again in');
}

// Robust click: scroll -> normal click -> Actions click -> JS click fallback
async function hardClick(driver, locator, label) {
  const el = await driver.wait(until.elementLocated(locator), WAIT_MS);
  await driver.wait(until.elementIsVisible(el), WAIT_MS);

  await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", el);
  await sleep(120);

  try {
    await el.click();
    return;
  } catch {}

  try {
    await driver.actions({ async: true }).move({ origin: el }).click().perform();
    return;
  } catch {}

  try {
    await driver.executeScript('arguments[0].click();', el);
    return;
  } catch (e) {
    throw new Error(`Could not click ${label}: ${e.message}`);
  }
}

async function waitUntilEnabledById(driver, id) {
  const el = await driver.wait(until.elementLocated(By.id(id)), WAIT_MS);

  await driver.wait(async () => {
    const disabled = await el.getAttribute('disabled');
    return disabled === null;
  }, WAIT_MS);

  return el;
}

async function waitForEitherDashboardOrChallenge(driver) {
  // Wait until either Dashboard (logout) or Challenge overlay appears
  return driver.wait(async () => {
    const dash = await driver.findElements(By.id('logout-button'));
    if (dash.length > 0) return 'DASHBOARD';

    const ch = await driver.findElements(By.id('challenge-overlay'));
    if (ch.length > 0) return 'CHALLENGE';

    return false;
  }, WAIT_MS);
}

(async function rateLimitSimulation() {
  console.log('▶ 05 SCENARIO 5 (Rate Limit Simulation): starting...');
  const driver = buildDriver();

  try {
    await driver.get(FRONTEND_URL);

    // Ensure login tab
    await hardClick(driver, By.id('login-tab'), 'login-tab');

    // Fill identifier + wrong password to trigger limiter
    await setValue(driver, 'identifier', 'clean@example.com');
    await setValue(driver, 'password', 'WrongPassword!!!');

    const maxAttempts = 50;
    let rateLimitMsg = null;

    for (let i = 1; i <= maxAttempts; i++) {
      await findWithHealing(driver, By.id('login-button'), 'login-button');
      await hardClick(driver, By.id('login-button'), 'login-button');

      // small pause for UI to update the message/button state
      await sleep(450);

      const msg = await getMessageText(driver);
      if (isRateLimitMessage(msg)) {
        rateLimitMsg = msg;
        console.log(`✅ Rate limit detected on attempt ${i}. Message: "${msg}"`);
        break;
      }
    }

    if (!rateLimitMsg) {
      throw new Error(`Rate limit never triggered. Last UI message: "${await getMessageText(driver)}"`);
    }

    // Determine wait time from UI message (fallback to ~window size)
    const secondsFromMsg = parseRetrySeconds(rateLimitMsg);
    const waitSeconds = secondsFromMsg ?? 32;

    console.log(`⏳ Waiting ${waitSeconds + 2}s for cooldown...`);
    await sleep((waitSeconds + 2) * 1000);

    // IMPORTANT: Wait until the UI actually enables the login button
    // (prevents "stuck cooldown" / stale React rendering from causing a dead click)
    console.log('⏳ Waiting until Login button becomes enabled...');
    await waitUntilEnabledById(driver, 'login-button');
    console.log('✅ Login button enabled.');

    // Now login correctly
    console.log('✅ Logging in with correct password...');
    await setValue(driver, 'password', 'Password123!');
    await hardClick(driver, By.id('login-button'), 'login-button');

    // Wait for either dashboard or challenge overlay
    const outcome = await waitForEitherDashboardOrChallenge(driver);

    if (outcome === 'DASHBOARD') {
      console.log('✅ Logged in directly (no challenge).');
      console.log('✅ 05 SCENARIO 5 PASSED.');
      return;
    }

    if (outcome === 'CHALLENGE') {
      console.log('🛡️ Challenge shown. Clicking VERIFY...');
      await hardClick(driver, By.id('challenge-verify-btn'), 'challenge-verify-btn');

      // After verify → must land on dashboard
      await driver.wait(until.elementLocated(By.id('logout-button')), WAIT_MS);
      console.log('✅ Verify succeeded → Dashboard reached.');
      console.log('✅ 05 SCENARIO 5 PASSED.');
      return;
    }

    // Should never reach here
    throw new Error(`Unexpected outcome. UI message: "${await getMessageText(driver)}"`);
  } catch (err) {
    console.error('❌ 05 SCENARIO 5 FAILED:', err.message);
    throw err;
  } finally {
    await driver.quit();
  }
})();
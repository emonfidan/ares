// selenium/tests/02_dynamic_id_recovery.js
// Scenario 1: Dynamic ID Recovery (self-healing demo)
// What it proves: when the primary locator is "broken", healing triggers and a fallback works

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');
const { findWithHealing } = require('../utils/heal');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const WAIT_MS = 15000;

(async function dynamicIdRecovery() {
  console.log('▶ 02 SCENARIO 1 (Dynamic ID Recovery): starting...');
  const driver = buildDriver();

  try {
    // 1) Open app
    await driver.get(FRONTEND_URL);

    // 2) Wait for login form
    await driver.wait(until.elementLocated(By.id('identifier')), WAIT_MS);
    await driver.wait(until.elementLocated(By.id('password')), WAIT_MS);

    // 3) Fill credentials
    await driver.findElement(By.id('identifier')).sendKeys('clean@example.com');
    await driver.findElement(By.id('password')).sendKeys('Password123!');

    // 4) INTENTIONALLY BROKEN primary locator to force healing
    //    This simulates "the selector changed" (dynamic IDs/classes, refactor, etc.)
    const { element: loginBtn, used } = await findWithHealing(
      driver,
      By.id('login-button-BROKEN'), // intentionally wrong
      [
        // fallback 1: type=submit button (stable-ish)
        By.css('button[type="submit"]'),
        // fallback 2: button containing the text "Login"
        By.xpath("//button[contains(.,'Login')]")
      ],
      6000,
      { intent: 'scenario1-dynamic-id-login-button' }
    );

    // Optional: print which locator ended up working
    if (used && used.using && used.value) {
      console.log(`ℹ️  02: Locator used = ${used.using}=${used.value}`);
    }

    await loginBtn.click();

    // 5) Verify dashboard loaded
    await driver.wait(
      until.elementLocated(By.xpath("//*[contains(text(),'Welcome to ARES')]")),
      WAIT_MS
    );

    console.log('✅ 02 SCENARIO 1 PASS: Login succeeded via healing');
  } catch (err) {
    console.error('❌ 02 SCENARIO 1 FAIL:', err.message);
    process.exitCode = 1;
  } finally {
    await driver.quit();
    console.log('▶ 02 SCENARIO 1: finished');
  }
})();
// selenium/tests/01_dynamic_id_recovery.js
// TEST 1: Dynamic ID Recovery (LLM-powered self-healing)
// What it proves: when the primary locator is "broken" and NO hardcoded
// fallbacks are provided, the unified LLM agent analyzes the DOM,
// diagnoses ELEMENT_NOT_FOUND, and returns a REPAIR_SELECTOR action.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');
const { findWithHealing } = require('../utils/heal');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const WAIT_MS = 30000;

(async function dynamicIdRecovery() {
  console.log('▶ TEST 1 (Dynamic ID Recovery — LLM Self-Healing): starting...');
  const driver = buildDriver();

  try {
    await driver.get(FRONTEND_URL);
    await driver.wait(until.elementLocated(By.id('identifier')), WAIT_MS);
    await driver.wait(until.elementLocated(By.id('password')), WAIT_MS);

    await driver.findElement(By.id('identifier')).sendKeys('clean@example.com');
    await driver.findElement(By.id('password')).sendKeys('Password123!');

    // INTENTIONALLY BROKEN selector — NO fallbacks — forces LLM heal agent
    console.log('🧪 Attempting login with broken selector (no fallbacks — LLM must heal)...');

    const { element: loginBtn, healed, llmRepaired } = await findWithHealing(
      driver,
      By.id('login-button-BROKEN'),  // intentionally wrong
      [],                              // NO fallbacks
      15000,
      { intent: 'login-button' }
    );

    console.log(`   Healed: ${healed}, LLM Repaired: ${llmRepaired}`);

    if (!healed || !llmRepaired) {
      throw new Error('Expected LLM repair (no fallbacks were provided)');
    }

    await loginBtn.click();

    await driver.wait(
      until.elementLocated(By.xpath("//*[contains(text(),'Welcome to ARES')]")),
      WAIT_MS
    );

    console.log('TEST 1 PASS: Login succeeded via LLM self-healing (no hardcoded fallbacks)');
  } catch (err) {
    console.error('TEST 1 FAIL:', err.message);
    process.exitCode = 1;
  } finally {
    await driver.quit();
    console.log('▶ TEST 1: finished');
  }
})();
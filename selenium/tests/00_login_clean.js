const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');
const { findWithHealing } = require('../utils/heal');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const WAIT_MS = 15000;

(async function loginClean() {
  console.log('▶ CLEAN LOGIN: starting...');
  const driver = buildDriver();

  try {
    await driver.get(FRONTEND_URL);

    await driver.wait(until.elementLocated(By.id('identifier')), WAIT_MS);

    await driver.findElement(By.id('identifier')).sendKeys('clean@example.com');
    await driver.findElement(By.id('password')).sendKeys('Password123!');

    const { element: loginBtn } = await findWithHealing(
      driver,
      By.id('login-button'),
      [
        By.css('button[type="submit"]'),
        By.xpath("//button[contains(.,'Login')]")
      ],
      6000,
      { intent: 'login-button' }
    );

    await loginBtn.click();

    await driver.wait(
      until.elementLocated(By.xpath("//*[contains(text(),'Welcome to ARES')]")),
      WAIT_MS
    );

    console.log('✅ CLEAN LOGIN PASS: Dashboard loaded');
  } catch (err) {
    console.error('❌ CLEAN LOGIN FAIL:', err.message);
    process.exitCode = 1;
  } finally {
    await driver.quit();
    console.log('▶ CLEAN LOGIN: finished');
  }
})();
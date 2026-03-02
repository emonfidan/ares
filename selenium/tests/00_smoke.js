// selenium/tests/00_smoke.js
const { By, until } = require("selenium-webdriver");
const { buildDriver } = require("../utils/driver");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

(async function smoke() {
  const driver = await buildDriver({ headless: false });

  try {
    await driver.get(FRONTEND_URL);

    await driver.wait(until.elementLocated(By.id("identifier")), 10000);
    await driver.wait(until.elementLocated(By.id("password")), 10000);
    await driver.wait(until.elementLocated(By.id("login-button")), 10000);

    console.log("✅ SMOKE PASS: Login form elements found");
  } catch (err) {
    console.error("❌ SMOKE FAIL:", err.message);
    process.exitCode = 1;
  } finally {
    await driver.quit();
  }
})();
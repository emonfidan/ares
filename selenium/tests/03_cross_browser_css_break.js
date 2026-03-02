// selenium/tests/03_cross_browser_css_break.js
// Scenario 3: Cross-browser consistency + intentional CSS breakage
// We load the page with ?breakCss=1, Google button becomes unclickable,
// test "self-heals" by removing the bad CSS effect, then clicks.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');
const { findWithHealing } = require('../utils/heal');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const WAIT_MS = 15000;

async function safeClick(driver, el) {
  try {
    await el.click();
    return true;
  } catch (e) {
    return false;
  }
}

(async function crossBrowserCssBreak() {
  const browser = (process.env.BROWSER || 'chrome').toLowerCase();
  console.log(`▶ 03 SCENARIO 3 (Cross-browser CSS break): starting... [${browser}]`);

  const driver = buildDriver();

  try {
    // Turn on the intentional CSS breakage
    await driver.get(`${FRONTEND_URL}/?breakCss=1`);
    await sleep(1500);

    // Find Google button
    await driver.wait(until.elementLocated(By.id('google-login-button')), WAIT_MS);

    const { element: googleBtn } = await findWithHealing(
      driver,
      By.id('google-login-button'),
      [
        By.xpath("//button[contains(.,'Continue with Google')]"),
        By.css('button.social-button.google')
      ],
      6000,
      { intent: 'scenario3-find-google' }
    );

    console.log('✅ Google button located');

    // Attempt click (should fail because pointer-events:none)
    let clicked = await safeClick(driver, googleBtn);

    if (clicked) {
      console.log('⚠️ Unexpected: Google click worked even though CSS was broken');
    } else {
      console.log('✅ As expected: click failed due to CSS breakage');

      // "Self-heal": remove the CSS break effect on the element
      await driver.executeScript(
        `
        const btn = document.getElementById('google-login-button');
        if (btn) {
          btn.style.pointerEvents = 'auto';
          btn.style.opacity = '1';
          btn.style.filter = 'none';
        }
        `
      );

      await sleep(500);

      // Re-find and click after heal (safer than clicking stale ref)
      const { element: healedBtn } = await findWithHealing(
        driver,
        By.id('google-login-button'),
        [
          By.xpath("//button[contains(.,'Continue with Google')]"),
          By.css('button.social-button.google')
        ],
        6000,
        { intent: 'scenario3-click-google-after-heal' }
      );

      const healedClick = await safeClick(driver, healedBtn);
      if (!healedClick) throw new Error('Still could not click Google button after CSS heal');

      console.log('✅ Clicked Google login button after CSS heal');
    }

    await sleep(1500);
    console.log(`✅ 03 SCENARIO 3 PASS: CSS break + heal works in ${browser}`);
  } catch (err) {
    console.error(`❌ 03 SCENARIO 3 FAIL [${browser}]:`, err.message);
    process.exitCode = 1;
  } finally {
    await sleep(800);
    await driver.quit();
    console.log(`▶ 03 SCENARIO 3: finished [${browser}]`);
  }
})();
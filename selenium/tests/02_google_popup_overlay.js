// selenium/tests/03_google_popup_overlay.js
// TEST 2: Popup/overlay blocks Google login
// popup appears -> LLM decides -> if CLOSE_POPUP then close -> continue

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');
const { findWithHealing } = require('../utils/heal');
const { decideOverlayAction } = require('../utils/llm');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const WAIT_MS = 15000;

(async function googlePopupOverlay() {
  console.log('▶ TEST 2 (Google Popup Overlay): starting...');
  const driver = buildDriver();

  try {
    // Ensure popup is only enabled for tests
    await driver.get(`${FRONTEND_URL}/?e2ePopup=1`);

    await sleep(2000);

    // Wait for Google button to exist in DOM
    await driver.wait(until.elementLocated(By.id('google-login-button')), WAIT_MS);

    // 1) Detect overlay
    let overlayPresent = false;
    let overlayText = '';

    try {
      await driver.wait(until.elementLocated(By.id('blocking-overlay')), 4000);
      overlayPresent = true;
      console.log('✅ Overlay detected (blocking-overlay present)');

      // Grab overlay text for LLM context (best-effort)
      try {
        const overlayEl = await driver.findElement(By.id('blocking-overlay'));
        overlayText = await overlayEl.getText();
      } catch (_) {}

      await sleep(2000);
    } catch (_) {
      console.log('ℹ️ Overlay not detected (if you expected it, check LoginForm.jsx/CSS edits)');
    }

    // 2) If overlay exists, LLM decides what to do
    if (overlayPresent) {
      const decision = await decideOverlayAction({
        overlayText,
        hasCloseButton: true,
        goal: 'Proceed to click the Google login button'
      });

      console.log('LLM decision:', decision);

      if (decision === 'CLOSE_POPUP') {
        const { element: closeBtn } = await findWithHealing(
          driver,
          By.id('popup-close'),
          [
            By.css('#blocking-overlay button'),
            By.xpath("//button[contains(.,'Close')]")
          ],
          6000,
          { intent: 'scenario2-close-popup' }
        );

        await closeBtn.click();
        console.log('Clicked popup close button');

        await sleep(2000);

        // Confirm overlay gone
        await driver.wait(async () => {
          const els = await driver.findElements(By.id('blocking-overlay'));
          return els.length === 0;
        }, WAIT_MS);

        console.log('Overlay closed (no longer blocking)');
      } else {
        console.log(' LLM chose CONTINUE (did not close popup)');
      }
    }

    // 3) Continue: click Google login button
    const { element: googleBtn } = await findWithHealing(
      driver,
      By.id('google-login-button'),
      [
        By.xpath("//button[contains(.,'Continue with Google')]"),
        By.css('button.social-button.google')
      ],
      6000,
      { intent: 'scenario2-click-google' }
    );

    await googleBtn.click();
    console.log('Clicked Google login button');

    await sleep(3000);

    console.log('TEST 2 PASS: LLM decision + popup handling + Google click attempted');
  } catch (err) {
    console.error('TEST 2 FAIL:', err.message);
    process.exitCode = 1;
  } finally {
    await sleep(2000);
    await driver.quit();
    console.log('▶ TEST 2: finished');
  }
})();
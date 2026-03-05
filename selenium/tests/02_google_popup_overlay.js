// selenium/tests/02_google_popup_overlay.js
// TEST 2: Popup/overlay blocks Google login — unified LLM agent handles it
// The LLM receives the full DOM + overlay context, diagnoses ELEMENT_OBSCURED,
// and returns a CLOSE_OVERLAY action with the selector of the close button.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');
const { findWithHealing, saveDomSnapshot, extractDomSnippet } = require('../utils/heal');
const { healPage } = require('../utils/llm');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const WAIT_MS = 15000;

(async function googlePopupOverlay() {
  console.log('▶ TEST 2 (Google Popup Overlay — Unified LLM Agent): starting...');
  const driver = buildDriver();

  try {
    await driver.get(`${FRONTEND_URL}/?e2ePopup=1`);
    await sleep(2000);
    await driver.wait(until.elementLocated(By.id('google-login-button')), WAIT_MS);

    // 1) Detect overlay
    let overlayPresent = false;
    let overlayHtml = '';

    try {
      await driver.wait(until.elementLocated(By.id('blocking-overlay')), 4000);
      overlayPresent = true;
      console.log('Overlay detected');

      const overlayEl = await driver.findElement(By.id('blocking-overlay'));
      overlayHtml = await driver.executeScript('return arguments[0].outerHTML;', overlayEl);
      console.log(`   Overlay HTML length: ${overlayHtml.length} chars`);
    } catch (_) {
      console.log('ℹOverlay not detected');
    }

    // 2) If overlay exists, ask the UNIFIED LLM agent what to do
    if (overlayPresent) {
      console.log('🤖 Sending page context to unified LLM heal agent...');

      const { html: fullHtml } = await saveDomSnapshot(driver, 'overlay_analysis');
      const domSnippet = extractDomSnippet(fullHtml);

      const decision = await healPage({
        intent: 'Click the Google login button to initiate OAuth flow',
        errorType: 'ELEMENT_OBSCURED',
        failedSelector: '#google-login-button',
        overlayHtml,
        domSnippet
      });

      console.log(`🤖 LLM decision: ${decision.action}`);

      if (decision.action === 'CLOSE_OVERLAY' && decision.cssSelector) {
        console.log(` LLM says close overlay via: ${decision.cssSelector}`);

        const closeBtn = await driver.findElement(By.css(decision.cssSelector));
        await closeBtn.click();
        console.log(' Clicked close button');

        await sleep(2000);

        // Confirm overlay gone
        await driver.wait(async () => {
          const els = await driver.findElements(By.id('blocking-overlay'));
          return els.length === 0;
        }, WAIT_MS);

        console.log(' Overlay closed');
      } else {
        console.log(` LLM chose ${decision.action} (not CLOSE_OVERLAY)`);
      }
    }

    // 3) Click Google login
    const { element: googleBtn } = await findWithHealing(
      driver,
      By.id('google-login-button'),
      [
        By.xpath("//button[contains(.,'Continue with Google')]"),
        By.css('button.social-button.google')
      ],
      6000,
      { intent: 'click-google-login' }
    );

    await googleBtn.click();
    console.log('Clicked Google login button');

    await sleep(3000);
    console.log('TEST 2 PASS: Unified LLM agent handled overlay + Google click succeeded');
  } catch (err) {
    console.error('TEST 2 FAIL:', err.message);
    process.exitCode = 1;
  } finally {
    await sleep(2000);
    await driver.quit();
    console.log('▶ TEST 2: finished');
  }
})();
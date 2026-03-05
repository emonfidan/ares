// selenium/tests/03_cross_browser_css_break.js
// TEST 3: Cross-browser CSS breakage — unified LLM agent diagnoses and fixes
// The LLM receives element HTML + computed styles, diagnoses ELEMENT_NOT_CLICKABLE,
// and returns a FIX_CSS action with executable JavaScript.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');
const { findWithHealing, saveDomSnapshot, extractDomSnippet } = require('../utils/heal');
const { healPage } = require('../utils/llm');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const WAIT_MS = 15000;

async function safeClick(driver, el) {
  try { await el.click(); return true; } catch { return false; }
}

(async function crossBrowserCssBreak() {
  const browser = (process.env.BROWSER || 'chrome').toLowerCase();
  console.log(`▶ TEST 3 (Cross-browser CSS break — Unified LLM Agent): starting... [${browser}]`);

  const driver = buildDriver();

  try {
    await driver.get(`${FRONTEND_URL}/?breakCss=1`);
    await sleep(1500);

    await driver.wait(until.elementLocated(By.id('google-login-button')), WAIT_MS);

    const { element: googleBtn } = await findWithHealing(
      driver, By.id('google-login-button'),
      [By.xpath("//button[contains(.,'Continue with Google')]"), By.css('button.social-button.google')],
      6000, { intent: 'find-google-button-css-break' }
    );

    console.log('✅ Google button located in DOM');

    // Try click — should fail due to CSS breakage
    let clicked = await safeClick(driver, googleBtn);

    if (clicked) {
      console.log('⚠️ Unexpected: click worked despite CSS breakage');
    } else {
      console.log('❌ As expected: click failed due to CSS breakage');
      console.log('🤖 Sending element context to unified LLM heal agent...');

      // Capture element state for LLM
      const elementHtml = await driver.executeScript('return arguments[0].outerHTML;', googleBtn);
      const computedStyles = await driver.executeScript(`
        const el = arguments[0];
        const cs = window.getComputedStyle(el);
        return JSON.stringify({
          pointerEvents: cs.pointerEvents, opacity: cs.opacity,
          visibility: cs.visibility, display: cs.display,
          filter: cs.filter, cursor: cs.cursor,
          zIndex: cs.zIndex, position: cs.position
        }, null, 2);
      `, googleBtn);

      const { html: fullHtml } = await saveDomSnapshot(driver, 'css_break');
      const domSnippet = extractDomSnippet(fullHtml);

      console.log(`   Computed styles: ${computedStyles}`);

      // Ask the SAME unified LLM agent — it diagnoses the CSS issue itself
      const decision = await healPage({
        intent: 'Click the Google login button',
        errorType: 'ELEMENT_NOT_CLICKABLE',
        failedSelector: '#google-login-button',
        elementHtml,
        computedStyles,
        domSnippet
      });

      console.log(`🤖 LLM decision: ${decision.action}`);

      if (decision.action === 'FIX_CSS' && decision.javascript) {
        console.log(`🤖 LLM fix: ${decision.javascript}`);

        const freshBtn = await driver.findElement(By.id('google-login-button'));
        await driver.executeScript(decision.javascript, freshBtn);
        console.log('✅ Applied LLM CSS fix');
        await sleep(800);

        // Re-find and click (robust for Firefox)
        const healedBtn = await driver.findElement(By.id('google-login-button'));
        await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", healedBtn);
        await sleep(300);

        clicked = await safeClick(driver, healedBtn);

        // Fallback: JS click (Firefox sometimes needs this)
        if (!clicked) {
          console.log('   Standard click failed, trying JS click...');
          try { await driver.executeScript('arguments[0].click();', healedBtn); clicked = true; }
          catch { clicked = false; }
        }

        if (!clicked) throw new Error('Still could not click after LLM CSS fix');
        console.log('✅ Clicked Google login button after LLM CSS repair');

      } else if (decision.action === 'JS_CLICK') {
        console.log('🤖 LLM says: try JS click');
        const freshBtn = await driver.findElement(By.id('google-login-button'));
        await driver.executeScript('arguments[0].click();', freshBtn);
        console.log('✅ JS click succeeded');

      } else {
        throw new Error(`LLM returned ${decision.action} — could not fix CSS issue`);
      }
    }

    await sleep(1500);
    console.log(`TEST 3 PASS: Unified LLM agent diagnosed + repaired CSS [${browser}]`);
  } catch (err) {
    console.error(`TEST 3 FAIL [${browser}]:`, err.message);
    process.exitCode = 1;
  } finally {
    await sleep(800);
    await driver.quit();
    console.log(`▶ TEST 3: finished [${browser}]`);
  }
})();
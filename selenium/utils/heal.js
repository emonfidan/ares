// utils/heal.js
// Self-healing element lookup for Selenium.
// Uses the unified LLM healPage agent when hardcoded fallbacks fail.

const fs = require('fs');
const path = require('path');
const { By, until } = require('selenium-webdriver');
const { healPage } = require('./llm');

// --- Log helpers ---

const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function appendHealLog(entry) {
  const logPath = path.join(LOG_DIR, 'heal_log.jsonl');
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
}

function locatorToString(loc) {
  if (!loc) return null;
  if (typeof loc.using === 'string' && typeof loc.value === 'string') {
    return `${loc.using}=${loc.value}`;
  }
  return String(loc);
}

// --- DOM helpers ---

async function saveDomSnapshot(driver, label = 'dom') {
  const html = await driver.getPageSource();
  const file = path.join(LOG_DIR, `${label}_${nowStamp()}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return { filePath: file, html };
}

function extractDomSnippet(fullHtml, maxLength = 4000) {
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : fullHtml;
  if (bodyHtml.length <= maxLength) return bodyHtml;
  const half = Math.floor(maxLength / 2);
  return bodyHtml.substring(0, half) + '\n... [truncated] ...\n' + bodyHtml.substring(bodyHtml.length - half);
}

// --- Core: findWithHealing ---

/**
 * findWithHealing
 *  1. Try primary locator
 *  2. Try hardcoded fallbacks
 *  3. Call the unified LLM healPage agent (REPAIR_SELECTOR action)
 *
 * Returns: { element, used, healed, llmRepaired }
 */
async function findWithHealing(driver, primary, fallbacks = [], waitMs = 8000, meta = {}) {
  const { intent = 'element lookup' } = meta;
  const ts = new Date().toISOString();
  const oldLocator = locatorToString(primary);
  let url = null;
  try { url = await driver.getCurrentUrl(); } catch (_) { }

  // 1) Primary locator
  try {
    await driver.wait(until.elementLocated(primary), waitMs);
    const el = await driver.findElement(primary);

    appendHealLog({
      ts, intent, oldLocator, newLocator: oldLocator,
      success: true, healed: false, llmRepaired: false, url, domPath: null
    });

    return { element: el, used: primary, healed: false, llmRepaired: false };
  } catch (e1) {
    const { filePath: domFile, html: fullHtml } = await saveDomSnapshot(driver, `heal_${intent}`);
    console.log(`🩹 Healing triggered (${intent}). DOM saved: ${domFile}`);
    console.log(`   Failed locator: ${oldLocator}`);

    // 2) Hardcoded fallbacks
    for (const fb of fallbacks) {
      const fbStr = locatorToString(fb);
      try {
        await driver.wait(until.elementLocated(fb), waitMs);
        const el = await driver.findElement(fb);
        console.log(`✅ Healed using fallback: ${fbStr}`);

        appendHealLog({
          ts: new Date().toISOString(), intent, oldLocator, newLocator: fbStr,
          success: true, healed: true, llmRepaired: false, url, domPath: domFile
        });

        return { element: el, used: fb, healed: true, llmRepaired: false };
      } catch (_) { }
    }

    // 3) Unified LLM heal agent
    console.log('🤖 All fallbacks failed. Invoking LLM heal agent...');

    try {
      const domSnippet = extractDomSnippet(fullHtml);
      const decision = await healPage({
        intent,
        errorType: 'ELEMENT_NOT_FOUND',
        failedSelector: oldLocator,
        domSnippet
      });

      if (decision.action === 'REPAIR_SELECTOR' && decision.cssSelector) {
        console.log(`🤖 LLM action: REPAIR_SELECTOR → "${decision.cssSelector}"`);
        const llmLocator = By.css(decision.cssSelector);

        try {
          await driver.wait(until.elementLocated(llmLocator), waitMs);
          const el = await driver.findElement(llmLocator);
          console.log(`✅ LLM repair successful!`);

          appendHealLog({
            ts: new Date().toISOString(), intent, oldLocator,
            newLocator: decision.cssSelector, success: true, healed: true,
            llmRepaired: true, llmAction: 'REPAIR_SELECTOR', url, domPath: domFile
          });

          return { element: el, used: llmLocator, healed: true, llmRepaired: true };
        } catch (_) {
          console.log(`❌ LLM-suggested selector didn't work: ${decision.cssSelector}`);
        }
      } else if (decision.action === 'CLOSE_OVERLAY' && decision.cssSelector) {
        // LLM detected an overlay blocking the element — try to close it
        console.log(`🤖 LLM action: CLOSE_OVERLAY → clicking "${decision.cssSelector}"`);
        try {
          const closeBtn = await driver.findElement(By.css(decision.cssSelector));
          await closeBtn.click();
          // Wait a beat, then retry the primary locator
          await new Promise(r => setTimeout(r, 1000));
          await driver.wait(until.elementLocated(primary), waitMs);
          const el = await driver.findElement(primary);
          console.log(`✅ LLM closed overlay, element found!`);

          appendHealLog({
            ts: new Date().toISOString(), intent, oldLocator,
            newLocator: oldLocator, success: true, healed: true,
            llmRepaired: true, llmAction: 'CLOSE_OVERLAY', url, domPath: domFile
          });

          return { element: el, used: primary, healed: true, llmRepaired: true };
        } catch (_) {
          console.log(`❌ LLM overlay close didn't work.`);
        }
      } else {
        console.log(`🤖 LLM returned: ${decision.action} (not actionable for element lookup)`);
      }
    } catch (llmError) {
      console.log(`❌ LLM heal error: ${llmError.message}`);
    }

    // 4) Total failure
    console.log(`❌ Healing failed. No fallback or LLM repair worked.`);
    appendHealLog({
      ts: new Date().toISOString(), intent, oldLocator,
      newLocator: null, success: false, healed: true, llmRepaired: false,
      url, domPath: domFile, error: 'All healing methods failed'
    });

    throw new Error(`findWithHealing failed for intent="${intent}"`);
  }
}

module.exports = { findWithHealing, saveDomSnapshot, extractDomSnippet, healPage };
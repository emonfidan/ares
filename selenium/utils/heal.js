// selenium/utils/heal.js
// Self-healing element lookup helper for Selenium
// - Tries a primary locator first
// - If it fails, captures a DOM snapshot
// - Tries fallback locators
// - If fallbacks fail, asks LLM for a new selector and validates it
// - Logs healing attempts/results to logs/heal_log.jsonl (JSON Lines)

const fs = require('fs');
const path = require('path');
const { until, By } = require('selenium-webdriver');
const { suggestSelector } = require('./llm');


// Log folder + helpers


// logs/ folder (at selenium/logs)
const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// A filesystem-safe timestamp (no ":" or ".")
function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// Append one JSON object per line (easy to grep + parse)
function appendHealLog(entry) {
  const logPath = path.join(LOG_DIR, 'heal_log.jsonl');
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
}

// Convert selenium-webdriver locator to a readable string safely
function locatorToString(loc) {
  if (!loc) return null;
  if (typeof loc.using === 'string' && typeof loc.value === 'string') {
    return `${loc.using}=${loc.value}`;
  }
  return String(loc);
}

// DOM snapshot helper


// Save full HTML snapshot of current page
async function saveDomSnapshot(driver, label = 'dom') {
  const html = await driver.getPageSource();
  const file = path.join(LOG_DIR, `${label}_${nowStamp()}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

// LLM selector parsing + validation helpers

function parseSuggestedSelector(raw) {
  if (!raw) return null;
  const line = String(raw).trim();

  // Must be a single line directive: "CSS: ..." or "XPATH: ..."
  if (/^CSS:\s*/i.test(line)) {
    return { type: 'css', value: line.replace(/^CSS:\s*/i, '').trim(), raw: line };
  }
  if (/^XPATH:\s*/i.test(line)) {
    return { type: 'xpath', value: line.replace(/^XPATH:\s*/i, '').trim(), raw: line };
  }
  return null;
}

function byFromParsed(p) {
  if (!p || !p.value) return null;
  if (p.type === 'css') return By.css(p.value);
  if (p.type === 'xpath') return By.xpath(p.value);
  return null;
}

async function validateSelectorExists(driver, by) {
  // findElements doesn't throw; returns []
  const els = await driver.findElements(by);
  return els.length > 0;
}

// findWithHealing (core)
async function findWithHealing(driver, primary, fallbacks = [], waitMs = 8000, meta = {}) {
  const { intent = 'element lookup' } = meta;

  const ts = new Date().toISOString();
  const oldLocator = locatorToString(primary);

  let url = null;
  try {
    url = await driver.getCurrentUrl();
  } catch (_) {}

  // 1) Try primary locator first
  try {
    await driver.wait(until.elementLocated(primary), waitMs);
    const el = await driver.findElement(primary);

    appendHealLog({
      ts,
      intent,
      oldLocator,
      newLocator: oldLocator,
      success: true,
      healed: false,
      url,
      domPath: null
    });

    return { element: el, used: primary };
  } catch (e1) {
    // Primary failed -> healing begins
    const domFile = await saveDomSnapshot(driver, `heal_${intent}`);
    console.log(`Healing triggered (${intent}). DOM saved: ${domFile}`);
    console.log(`   Failed locator: ${oldLocator}`);

    // 2) Try fallbacks first (your current behavior)
    for (const fb of fallbacks) {
      const fbStr = locatorToString(fb);

      try {
        await driver.wait(until.elementLocated(fb), waitMs);
        const el = await driver.findElement(fb);

        console.log(` Healed using fallback: ${fbStr}`);

        appendHealLog({
          ts: new Date().toISOString(),
          intent,
          oldLocator,
          newLocator: fbStr,
          success: true,
          healed: true,
          url,
          domPath: domFile,
          strategy: 'fallback'
        });

        return { element: el, used: fb };
      } catch (_) {
        // keep trying
      }
    }

    // 3) FallBacks failed -> try LLM selector repair
    try {
      const domHtml = await driver.getPageSource();

      const llmRaw = await suggestSelector({
        domHtml,
        goal: intent,
        oldLocator
      });

      const parsed = parseSuggestedSelector(llmRaw);
      const by = byFromParsed(parsed);

      if (!by) throw new Error(`LLM output not parseable as selector: "${llmRaw}"`);

      const exists = await validateSelectorExists(driver, by);
      if (!exists) throw new Error(`LLM selector did not match any element: "${llmRaw}"`);

      // Now use it as the healed selector
      await driver.wait(until.elementLocated(by), waitMs);
      const el = await driver.findElement(by);

      console.log(` Healed using LLM selector: ${llmRaw}`);

      appendHealLog({
        ts: new Date().toISOString(),
        intent,
        oldLocator,
        newLocator: locatorToString(by),
        success: true,
        healed: true,
        url,
        domPath: domFile,
        strategy: 'llm',
        llmRaw
      });

      return { element: el, used: by };
    } catch (llmErr) {
      console.log(` LLM heal failed: ${llmErr.message}`);
      // Continue to final failure logging below
      appendHealLog({
        ts: new Date().toISOString(),
        intent,
        oldLocator,
        newLocator: null,
        success: false,
        healed: true,
        url,
        domPath: domFile,
        strategy: 'llm',
        error: llmErr?.message || 'LLM heal failed'
      });
    }

    // 4) Everything failed
    console.log(`Healing failed. No fallback or LLM selector worked.`);

    appendHealLog({
      ts: new Date().toISOString(),
      intent,
      oldLocator,
      newLocator: null,
      success: false,
      healed: true,
      url,
      domPath: domFile,
      strategy: 'none',
      error: e1?.message || 'Primary locator failed; fallbacks + LLM also failed'
    });

    throw new Error(`findWithHealing failed for intent="${intent}"`);
  }
}

module.exports = { findWithHealing, saveDomSnapshot };

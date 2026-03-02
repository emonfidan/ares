// utils/heal.js
// Self-healing element lookup helper for Selenium
// - Tries a primary locator first
// - If it fails, captures a DOM snapshot
// - Tries fallback locators
// - Logs healing attempts/results to logs/heal_log.jsonl (JSON Lines)

const fs = require('fs');
const path = require('path');
const { until } = require('selenium-webdriver');

// -----------------------------
// Log folder + helpers
// -----------------------------

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
  // selenium-webdriver "By" objects typically have using/value
  if (typeof loc.using === 'string' && typeof loc.value === 'string') {
    return `${loc.using}=${loc.value}`;
  }
  // fallback: best effort
  return String(loc);
}

// -----------------------------
// DOM snapshot helper
// -----------------------------

// Save full HTML snapshot of current page
async function saveDomSnapshot(driver, label = 'dom') {
  const html = await driver.getPageSource();
  const file = path.join(LOG_DIR, `${label}_${nowStamp()}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

// -----------------------------
// findWithHealing (core)
// -----------------------------
/**
 * findWithHealing
 * - tries primary locator
 * - if missing, saves DOM + tries fallbacks
 * - returns: { element, used }
 *
 * Logs (logs/heal_log.jsonl):
 * - intent
 * - old locator (primary)
 * - new locator (fallback that worked)
 * - timestamp
 * - success/failure
 * - url
 * - dom snapshot path
 * - error (if any)
 */
async function findWithHealing(driver, primary, fallbacks = [], waitMs = 8000, meta = {}) {
  const { intent = 'element lookup' } = meta;

  // We'll reuse these in logs whether we succeed or fail
  const ts = new Date().toISOString();
  const oldLocator = locatorToString(primary);

  // Try to record current URL for log context (best effort)
  let url = null;
  try {
    url = await driver.getCurrentUrl();
  } catch (_) {}

  // 1) Try primary locator first
  try {
    await driver.wait(until.elementLocated(primary), waitMs);
    const el = await driver.findElement(primary);

    // Optional: log "no healing needed" as a normal success entry
    // (This helps show the system is working even when nothing breaks.)
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
    console.log(`🩹 Healing triggered (${intent}). DOM saved: ${domFile}`);
    console.log(`   Failed locator: ${oldLocator}`);

    // 2) Try fallbacks
    for (const fb of fallbacks) {
      const fbStr = locatorToString(fb);

      try {
        await driver.wait(until.elementLocated(fb), waitMs);
        const el = await driver.findElement(fb);

        console.log(`✅ Healed using: ${fbStr}`);

        // Log a healing success
        appendHealLog({
          ts: new Date().toISOString(), // timestamp of actual heal success
          intent,
          oldLocator,
          newLocator: fbStr,
          success: true,
          healed: true,
          url,
          domPath: domFile
        });

        return { element: el, used: fb };
      } catch (e2) {
        // Keep trying other fallbacks
      }
    }

    // 3) All fallbacks failed -> healing failure
    console.log(`❌ Healing failed. No fallback worked.`);

    appendHealLog({
      ts: new Date().toISOString(),
      intent,
      oldLocator,
      newLocator: null,
      success: false,
      healed: true,
      url,
      domPath: domFile,
      error: e1?.message || 'Primary locator failed; fallbacks also failed'
    });

    throw new Error(`findWithHealing failed for intent="${intent}"`);
  }
}

module.exports = { findWithHealing, saveDomSnapshot };
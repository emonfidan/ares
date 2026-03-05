// utils/heal.js
// Self-healing element lookup for Selenium.
// Pipeline: primary → hardcoded fallbacks → heuristic scoring → LLM repair
// Also provides Shadow DOM MutationObserver injection for async change tracking.

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

// --- Shadow DOM Listener ---

/**
 * injectMutationObserver
 * Injects a MutationObserver into the page via executeScript.
 * Tracks DOM mutations (added/removed nodes, attribute changes) into window._domMutations.
 * Safe to call multiple times — skips injection if already active.
 */
async function injectMutationObserver(driver) {
  try {
    await driver.executeScript(`
      if (!window._aresObserver) {
        window._domMutations = [];
        window._aresObserver = new MutationObserver(function(mutations) {
          mutations.forEach(function(m) {
            window._domMutations.push({
              type: m.type,
              targetId: m.target.id || null,
              targetClass: m.target.className || null,
              targetTag: m.target.tagName || null,
              addedNodes: m.addedNodes.length,
              removedNodes: m.removedNodes.length,
              attributeName: m.attributeName || null,
              timestamp: Date.now()
            });
            // Cap log at 100 entries to avoid memory growth
            if (window._domMutations.length > 100) window._domMutations.shift();
          });
        });
        window._aresObserver.observe(document.body, {
          childList: true, subtree: true, attributes: true, attributeOldValue: true
        });
      }
    `);
  } catch (_) {
    // Page may have navigated; observer will be re-injected on next call
  }
}

/**
 * getDomMutations
 * Retrieves the list of observed DOM mutations from window._domMutations.
 * Returns an empty array if the observer has not been injected or page navigated.
 */
async function getDomMutations(driver) {
  try {
    return await driver.executeScript('return window._domMutations || [];');
  } catch (_) {
    return [];
  }
}

// --- Historical Metadata ---

const METADATA_FILE = path.join(LOG_DIR, 'heal_metadata.json');

function loadMetadata() {
  try {
    if (fs.existsSync(METADATA_FILE)) {
      return JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    }
  } catch (_) { }
  return {};
}

function saveMetadata(data) {
  try { fs.writeFileSync(METADATA_FILE, JSON.stringify(data, null, 2)); } catch (_) { }
}

/**
 * saveElementMetadata
 * Captures and persists metadata about a successfully found element:
 * bounding rect (location + size), background color, and parent tag.
 * Used by heuristicFindElement as historical anchor for future scoring.
 */
async function saveElementMetadata(driver, el, intent) {
  try {
    const meta = await driver.executeScript(`
      const el = arguments[0];
      const rect = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      const parent = el.parentElement;
      return {
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        bgColor: cs.backgroundColor,
        color: cs.color,
        parentTag: parent ? parent.tagName.toLowerCase() : null,
        parentClass: parent ? (parent.className || '').trim().split(/\\s+/)[0] : null,
        tagName: el.tagName.toLowerCase(),
        text: (el.textContent || el.value || '').trim().substring(0, 60)
      };
    `, el);
    const all = loadMetadata();
    all[intent] = { ...meta, savedAt: new Date().toISOString() };
    saveMetadata(all);
  } catch (_) { }
}

// --- Heuristic Scoring ---

/**
 * heuristicFindElement
 * Finds interactive elements in the DOM and scores them against:
 *   - Intent keywords (text, id, aria-label, name, class match)
 *   - Historical Metadata (location proximity, bg color match, parent tag match)
 * Returns { element, selector, score } for best candidate above threshold, or null.
 * Acts as step 2.5 — after fallbacks, before LLM.
 */
async function heuristicFindElement(driver, intent, threshold = 50) {
  try {
    const historical = loadMetadata()[intent] || null;

    const scored = await driver.executeScript(`
      const intent = arguments[0];
      const hist = arguments[1];  // historical metadata or null
      const intentLower = intent.toLowerCase();
      const words = intentLower.split(/[-_\\s]+/).filter(Boolean);

      const candidates = Array.from(
        document.querySelectorAll('button, input[type="submit"], input[type="button"], a[href], [role="button"]')
      );

      function scoreEl(el) {
        let s = 0;
        const text    = (el.textContent || el.value || el.placeholder || '').toLowerCase();
        const id      = (el.id || '').toLowerCase();
        const cls     = (el.className || '').toLowerCase();
        const ariaLbl = (el.getAttribute('aria-label') || '').toLowerCase();
        const name    = (el.name || '').toLowerCase();

        // --- Intent keyword scoring ---
        words.forEach(function(w) {
          if (text.includes(w))    s += 40;
          if (id.includes(w))      s += 35;
          if (ariaLbl.includes(w)) s += 30;
          if (name.includes(w))    s += 25;
          if (cls.includes(w))     s += 20;
        });

        // Tag / type bonuses
        if (el.tagName === 'BUTTON') s += 10;
        if (el.type === 'submit')    s += 15;
        if (el.tagName === 'INPUT')  s +=  5;

        // Visibility
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) s += 10;

        // --- Historical Metadata scoring ---
        if (hist) {
          const cs = window.getComputedStyle(el);
          const parent = el.parentElement;

          // Location proximity: +20 if within 80px of historical position
          if (hist.rect) {
            const dx = Math.abs(rect.x - hist.rect.x);
            const dy = Math.abs(rect.y - hist.rect.y);
            if (dx < 80 && dy < 80) s += 20;
          }

          // Background color match: +15
          if (hist.bgColor && cs.backgroundColor === hist.bgColor) s += 15;

          // Parent tag match: +10
          if (hist.parentTag && parent && parent.tagName.toLowerCase() === hist.parentTag) s += 10;

          // Same tag name: +5
          if (hist.tagName && el.tagName.toLowerCase() === hist.tagName) s += 5;
        }

        // Build selector
        let sel = el.tagName.toLowerCase();
        if (el.id) sel = '#' + el.id;
        else if (el.className) sel = el.tagName.toLowerCase() + '.' + el.className.trim().split(/\\s+/)[0];

        return { score: s, selector: sel, text: text.substring(0, 60) };
      }

      return candidates
        .map(function(el) { return scoreEl(el); })
        .filter(function(c) { return c.score > 0; })
        .sort(function(a, b) { return b.score - a.score; })
        .slice(0, 5);
    `, intent, historical);

    if (!scored || scored.length === 0) return null;

    const best = scored[0];
    if (best.score < threshold) {
      console.log(`   Heuristic best "${best.selector}" scored ${best.score} (below threshold ${threshold})`);
      return null;
    }

    console.log(`   Heuristic match: "${best.selector}" (score=${best.score}${historical ? ', used historical metadata' : ''})`);
    const locator = By.css(best.selector);
    const el = await driver.findElement(locator);
    return { element: el, selector: best.selector, score: best.score };
  } catch (e) {
    console.log(`   Heuristic scoring error: ${e.message}`);
    return null;
  }
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
  const { intent = 'element lookup', skipHeuristic = false } = meta;
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

    // Save historical metadata for future heuristic scoring
    await saveElementMetadata(driver, el, intent);

    return { element: el, used: primary, healed: false, llmRepaired: false };
  } catch (e1) {
    const { filePath: domFile, html: fullHtml } = await saveDomSnapshot(driver, `heal_${intent}`);
    console.log(` Healing triggered (${intent}). DOM saved: ${domFile}`);
    console.log(`   Failed locator: ${oldLocator}`);

    // 2) Hardcoded fallbacks
    for (const fb of fallbacks) {
      const fbStr = locatorToString(fb);
      try {
        await driver.wait(until.elementLocated(fb), waitMs);
        const el = await driver.findElement(fb);
        console.log(` Healed using fallback: ${fbStr}`);

        appendHealLog({
          ts: new Date().toISOString(), intent, oldLocator, newLocator: fbStr,
          success: true, healed: true, llmRepaired: false, url, domPath: domFile
        });

        return { element: el, used: fb, healed: true, llmRepaired: false };
      } catch (_) { }
    }

    // 2.5) Heuristic scoring — faster than LLM, no API call
    //      Skip if caller explicitly wants LLM to handle it (e.g. TC-01)
    if (!skipHeuristic) {
      console.log(' Trying heuristic scoring...');
      const heuristicResult = await heuristicFindElement(driver, intent);
      if (heuristicResult) {
        console.log(` Heuristic repair successful! Selector: "${heuristicResult.selector}"`);
        appendHealLog({
          ts: new Date().toISOString(), intent, oldLocator,
          newLocator: heuristicResult.selector, success: true, healed: true,
          llmRepaired: false, llmAction: null, url, domPath: domFile,
          heuristicScore: heuristicResult.score
        });
        return { element: heuristicResult.element, used: By.css(heuristicResult.selector), healed: true, llmRepaired: false };
      }
    } else {
      console.log(' Heuristic scoring skipped (skipHeuristic=true) — going straight to LLM.');
    }

    // 3) Unified LLM heal agent
    console.log(' All fallbacks + heuristic failed. Invoking LLM heal agent...');

    try {
      const domSnippet = extractDomSnippet(fullHtml);
      const decision = await healPage({
        intent,
        errorType: 'ELEMENT_NOT_FOUND',
        failedSelector: oldLocator,
        domSnippet
      });

      if (decision.action === 'REPAIR_SELECTOR' && decision.cssSelector) {
        console.log(` LLM action: REPAIR_SELECTOR → "${decision.cssSelector}"`);
        const llmLocator = By.css(decision.cssSelector);

        try {
          await driver.wait(until.elementLocated(llmLocator), waitMs);
          const el = await driver.findElement(llmLocator);
          console.log(` LLM repair successful!`);

          appendHealLog({
            ts: new Date().toISOString(), intent, oldLocator,
            newLocator: decision.cssSelector, success: true, healed: true,
            llmRepaired: true, llmAction: 'REPAIR_SELECTOR', url, domPath: domFile
          });

          return { element: el, used: llmLocator, healed: true, llmRepaired: true };
        } catch (_) {
          console.log(` LLM-suggested selector didn't work: ${decision.cssSelector}`);
        }
      } else if (decision.action === 'CLOSE_OVERLAY' && decision.cssSelector) {
        // LLM detected an overlay blocking the element — try to close it
        console.log(` LLM action: CLOSE_OVERLAY → clicking "${decision.cssSelector}"`);
        try {
          const closeBtn = await driver.findElement(By.css(decision.cssSelector));
          await closeBtn.click();
          // Wait a beat, then retry the primary locator
          await new Promise(r => setTimeout(r, 1000));
          await driver.wait(until.elementLocated(primary), waitMs);
          const el = await driver.findElement(primary);
          console.log(` LLM closed overlay, element found!`);

          appendHealLog({
            ts: new Date().toISOString(), intent, oldLocator,
            newLocator: oldLocator, success: true, healed: true,
            llmRepaired: true, llmAction: 'CLOSE_OVERLAY', url, domPath: domFile
          });

          return { element: el, used: primary, healed: true, llmRepaired: true };
        } catch (_) {
          console.log(` LLM overlay close didn't work.`);
        }
      } else {
        console.log(` LLM returned: ${decision.action} (not actionable for element lookup)`);
      }
    } catch (llmError) {
      console.log(` LLM heal error: ${llmError.message}`);
    }

    // 4) Total failure
    console.log(` Healing failed. No fallback or LLM repair worked.`);
    appendHealLog({
      ts: new Date().toISOString(), intent, oldLocator,
      newLocator: null, success: false, healed: true, llmRepaired: false,
      url, domPath: domFile, error: 'All healing methods failed'
    });

    throw new Error(`findWithHealing failed for intent="${intent}"`);
  }
}

module.exports = {
  findWithHealing,
  saveDomSnapshot,
  extractDomSnippet,
  healPage,
  injectMutationObserver,
  getDomMutations,
  heuristicFindElement,
  saveElementMetadata,
  loadMetadata
};
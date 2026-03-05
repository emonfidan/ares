// selenium/utils/llm.js
// Unified self-healing LLM agent for the Selenium test framework.
// A single prompt analyzes the page state and returns a structured action.

const { GoogleGenerativeAI } = require('@google/generative-ai');

function getGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY in environment for Selenium');
  return new GoogleGenerativeAI(key);
}

/**
 * healPage — the unified self-healing agent.
 *
 * Given context about what went wrong (element not found, element not clickable,
 * overlay blocking, etc.), it analyzes the DOM and returns a structured action.
 *
 * @param {object} context
 * @param {string} context.intent       - What the test is trying to do
 * @param {string} context.errorType    - "ELEMENT_NOT_FOUND" | "ELEMENT_NOT_CLICKABLE" | "ELEMENT_OBSCURED"
 * @param {string} context.domSnippet   - Relevant DOM HTML
 * @param {string} [context.failedSelector]  - The selector that didn't work
 * @param {string} [context.elementHtml]     - Outer HTML of the found-but-broken element
 * @param {string} [context.computedStyles]  - JSON string of computed CSS styles
 * @param {string} [context.overlayHtml]     - Outer HTML of the blocking overlay
 *
 * @returns {object} One of:
 *   { action: "REPAIR_SELECTOR", cssSelector: "..." }
 *   { action: "FIX_CSS",         javascript: "..." }
 *   { action: "CLOSE_OVERLAY",   cssSelector: "..." }
 *   { action: "JS_CLICK" }
 *   { action: "NONE" }
 */
async function healPage(context) {
  const {
    intent = 'interact with element',
    errorType = 'UNKNOWN',
    domSnippet = '',
    failedSelector = '',
    elementHtml = '',
    computedStyles = '',
    overlayHtml = ''
  } = context;

  const genAI = getGemini();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const prompt = `You are the self-healing engine for an automated Selenium test framework called ARES.

Your job: analyze the current page state and determine the BEST single action to fix a test failure.

═══════════════════════════════════
SITUATION
═══════════════════════════════════
Intent: ${intent}
Error type: ${errorType}
Failed selector: ${failedSelector || '(none)'}

${elementHtml ? `Element HTML (found but not interactable):\n${elementHtml}\n` : ''}
${computedStyles ? `Computed styles:\n${computedStyles}\n` : ''}
${overlayHtml ? `Blocking overlay HTML:\n${overlayHtml}\n` : ''}

═══════════════════════════════════
CURRENT PAGE DOM (snippet)
═══════════════════════════════════
${domSnippet}

═══════════════════════════════════
AVAILABLE ACTIONS — respond with EXACTLY ONE as JSON
═══════════════════════════════════

1. REPAIR_SELECTOR — The element exists in the DOM but the test used a wrong/outdated selector.
   Analyze the DOM to find the correct element based on the intent and failed selector name.
   {"action":"REPAIR_SELECTOR","cssSelector":"the-correct-css-selector"}

2. FIX_CSS — The element exists but CSS properties prevent interaction (pointer-events:none, opacity:0, visibility:hidden, etc.).
   Return executable JavaScript using arguments[0] (Selenium convention).
   IMPORTANT: use classList.remove('className') to remove offending classes. Use style.setProperty('prop','value','important') to override !important rules. NEVER use style.removeProperty() or direct style assignment against !important.
   {"action":"FIX_CSS","javascript":"arguments[0].classList.remove('bad-class'); arguments[0].style.setProperty('pointer-events','auto','important');"}

3. CLOSE_OVERLAY — A popup/overlay/modal is blocking the target element. Return the CSS selector of the button or element to click to dismiss it.
   {"action":"CLOSE_OVERLAY","cssSelector":"selector-of-close-button"}

4. JS_CLICK — The element exists and appears interactable but a standard click failed. Use a JavaScript click fallback.
   {"action":"JS_CLICK"}

5. NONE — You cannot determine a fix from the available information.
   {"action":"NONE"}

═══════════════════════════════════
RULES
═══════════════════════════════════
- Return ONLY valid JSON. No explanation, no markdown, no backticks.
- Pick the SINGLE BEST action for the situation.
- For REPAIR_SELECTOR: the CSS selector must match exactly ONE element in the DOM.
- For FIX_CSS: always prefer classList.remove() over inline style overrides.
- For CLOSE_OVERLAY: pick the most obvious close/dismiss button.

JSON response:`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    console.log(`   🤖 LLM raw response: ${raw}`);

    // Clean up: remove markdown fences, backticks, etc.
    const cleaned = raw
      .replace(/^```(?:json)?\n?/i, '')
      .replace(/\n?```$/i, '')
      .replace(/^`+|`+$/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    // Validate action field
    const validActions = ['REPAIR_SELECTOR', 'FIX_CSS', 'CLOSE_OVERLAY', 'JS_CLICK', 'NONE'];
    if (!parsed.action || !validActions.includes(parsed.action)) {
      console.log('   🤖 LLM returned invalid action, defaulting to NONE');
      return { action: 'NONE' };
    }

    return parsed;
  } catch (error) {
    console.error(`   🤖 LLM heal error: ${error.message}`);
    return { action: 'NONE' };
  }
}

module.exports = { healPage };
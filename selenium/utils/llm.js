// selenium/utils/llm.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

function getGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY in environment for Selenium');
  return new GoogleGenerativeAI(key);
}

/**
 * Ask Gemini what to do when an overlay/popup blocks a critical button.
 * Returns one of: "CLOSE_POPUP" or "CONTINUE"
 */
async function decideOverlayAction({ overlayText = '', hasCloseButton = true, goal = '' }) {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const prompt = `
You are a Selenium test assistant. Your job is to decide the next action.

Goal: ${goal}

Context:
- An overlay/popup may be blocking the UI.
- Overlay text: "${overlayText}"
- Close button exists: ${hasCloseButton}

Rules:
1) If an overlay is blocking progress AND a close button exists, respond with EXACTLY: CLOSE_POPUP
2) Otherwise respond with EXACTLY: CONTINUE
3) Output must be ONLY one of these two words.

Answer:
`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim().toUpperCase();

  if (raw.includes('CLOSE_POPUP')) return 'CLOSE_POPUP';
  return 'CONTINUE';
}

module.exports = { decideOverlayAction };
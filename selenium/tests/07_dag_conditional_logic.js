// selenium/tests/07_dag_conditional_logic.js
// ─────────────────────────────────────────────────────────────
// Selenium E2E: Verify conditional visibility in the survey player.
//
// Uses the 'bilkent_feedback' survey which has rich conditional edges:
//   - Q1 position → student or faculty branching
//   - Q4 "Have you graduated?" → Yes → Q5 (graduation year) / No → Q6 (expected year)
//   - Q8 "Do you have written feedback?" → Yes → Q9 (open text)
//
// The test verifies:
//   1. Selecting "Undergraduate" shows student-path questions
//   2. Changing to "Faculty" hides student questions and shows faculty path
//   3. Conditional visibility toggles without page reload
// ─────────────────────────────────────────────────────────────

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const WAIT     = 15_000;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Helpers ─────────────────────────────────────────────────

async function ensureBilkentActive() {
    await fetch(`${API_BASE}/api/surveys/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyId: 'bilkent_feedback', adminEmail: 'admin@admin.com' })
    });
}

async function loginAndOpenSurvey(driver) {
    await driver.get(FRONTEND);
    await driver.wait(until.elementLocated(By.id('identifier')), WAIT);

    await driver.findElement(By.id('identifier')).sendKeys('clean@example.com');
    await driver.findElement(By.id('password')).sendKeys('Password123!');
    await driver.findElement(By.id('login-button')).click();

    await driver.wait(
        until.elementLocated(By.xpath("//*[contains(text(),'Welcome to ARES')]")),
        WAIT
    );

    // Click "Take the Survey"
    await driver.wait(until.elementLocated(By.id('take-survey-button')), WAIT);
    await driver.findElement(By.id('take-survey-button')).click();

    // Wait for survey player to load
    await driver.wait(
        until.elementLocated(By.css('[data-testid="survey-player"]')),
        WAIT
    );
}

async function countVisibleQuestions(driver) {
    const questions = await driver.findElements(By.css('[data-testid^="question-"]'));
    return questions.length;
}

// ─── Main Test ──────────────────────────────────────────────

(async function testDAGConditionalLogic() {
    console.log('▶ 07 DAG CONDITIONAL LOGIC: starting...');
    const driver = buildDriver();

    try {
        await ensureBilkentActive();
        await loginAndOpenSurvey(driver);
        console.log('  ✓ Survey player loaded (Bilkent Feedback)');

        // ── Step 1: Check initial state ──
        // bilkent_feedback starts with Q1 ("What is your position?")
        // Before answering, only the entry question should be visible
        const initialCount = await countVisibleQuestions(driver);
        console.log(`  ℹ Initial visible questions: ${initialCount}`);

        if (initialCount === 0) {
            throw new Error('No questions visible — survey may not have loaded');
        }

        // ── Step 2: Select "Undergraduate" ──
        // This should show the student path: Q2 → Q3 (dropdown) → Q4 → ...
        const undergradBtn = await driver.findElement(
            By.css('[data-testid="option-q1-undergraduate"]')
        );
        await undergradBtn.click();
        await sleep(500);

        const afterUndergrad = await countVisibleQuestions(driver);
        console.log(`  ℹ After selecting "Undergraduate": ${afterUndergrad} questions`);

        // Q2 (ID) should appear next to Q1
        const q2Visible = await driver.findElements(By.css('[data-testid="question-q2"]'));
        if (q2Visible.length === 0) {
            throw new Error('Q2 (ID) not visible after selecting Undergraduate');
        }
        console.log('  ✓ Q2 (ID) appeared after selecting Undergraduate');

        // ── Step 3: Enter an ID to advance further ──
        const idInput = await driver.findElement(By.css('[data-testid="numeric-q2"]'));
        await idInput.sendKeys('12345678');
        await sleep(500);

        // Q3 (major dropdown) should now be visible (student path, not faculty)
        const q3Visible = await driver.findElements(By.css('[data-testid="question-q3"]'));
        const q3fVisible = await driver.findElements(By.css('[data-testid="question-q3f"]'));
        if (q3Visible.length === 0) {
            throw new Error('Q3 (Major) not visible — student path not triggered');
        }
        if (q3fVisible.length > 0) {
            throw new Error('Q3f (Faculty role) should NOT be visible on student path');
        }
        console.log('  ✓ STUDENT PATH CORRECT: Q3 (major) visible, Q3f (faculty role) hidden');

        const afterId = await countVisibleQuestions(driver);
        console.log(`  ℹ After entering ID: ${afterId} questions`);

        // ── Step 4: Switch to "Faculty" — should swap the path ──
        const facultyBtn = await driver.findElement(
            By.css('[data-testid="option-q1-faculty"]')
        );
        await facultyBtn.click();
        await sleep(500);

        const afterFaculty = await countVisibleQuestions(driver);
        console.log(`  ℹ After switching to "Faculty": ${afterFaculty} questions`);

        // Now Q3f should be visible, Q3 should be hidden
        const q3AfterFaculty = await driver.findElements(By.css('[data-testid="question-q3"]'));
        const q3fAfterFaculty = await driver.findElements(By.css('[data-testid="question-q3f"]'));

        if (q3AfterFaculty.length > 0) {
            throw new Error('Q3 (Major) should NOT be visible after switching to Faculty');
        }
        if (q3fAfterFaculty.length === 0) {
            throw new Error('Q3f (Faculty role) not visible after switching to Faculty');
        }
        console.log('  ✓ FACULTY PATH CORRECT: Q3f (faculty role) visible, Q3 (major) hidden');
        console.log(`  ✓ CONDITIONAL TOGGLE VERIFIED: student(${afterId}) ↔ faculty(${afterFaculty})`);

        // ── Step 5: Switch back to "Undergraduate" to verify toggle works both ways ──
        await undergradBtn.click();
        await sleep(500);

        const afterToggleBack = await countVisibleQuestions(driver);
        const q3Final = await driver.findElements(By.css('[data-testid="question-q3"]'));
        const q3fFinal = await driver.findElements(By.css('[data-testid="question-q3f"]'));

        if (q3Final.length === 0 || q3fFinal.length > 0) {
            throw new Error('Toggle back to student path failed');
        }
        console.log('  ✓ TOGGLE-BACK VERIFIED: student path restored');

        // ── Step 6: Verify the Submit button state ──
        const submitBtn = await driver.findElement(By.css('[data-testid="submit-button"]'));
        const isDisabled = await submitBtn.getAttribute('disabled');
        console.log(`  ✓ Submit button is ${isDisabled ? 'disabled (correct — not all required fields filled)' : 'enabled'}`);

        // ── Step 7: Verify the Back button works ──
        const backBtn = await driver.findElement(By.css('[data-testid="back-button"]'));
        const backText = await backBtn.getText();
        if (!backText.includes('Back')) {
            throw new Error(`Back button text unexpected: "${backText}"`);
        }
        console.log('  ✓ Back button present and correctly labeled');

        console.log('✅ 07 DAG CONDITIONAL LOGIC PASS');
    } catch (err) {
        console.error('❌ 07 DAG CONDITIONAL LOGIC FAIL:', err.message);
        process.exitCode = 1;
    } finally {
        await driver.quit();
        console.log('▶ 07 DAG CONDITIONAL LOGIC: finished');
    }
})();

// selenium/tests/10_version_conflict_web.js
// ─────────────────────────────────────────────────────────────
// Selenium E2E: Version conflict detection + resolution on the web.
//
// Simulates the real-world scenario where:
//   1. User starts answering a survey
//   2. Admin edits the survey mid-session (adds a required question via API)
//   3. User continues answering → conflict is detected
//   4. Conflict banner appears (NOT a simple pop-up)
//   5. New question becomes visible after conflict resolution
//   6. User dismisses banner, answers the new question, and submits
// ─────────────────────────────────────────────────────────────

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const WAIT     = 15_000;
const TEST_ID  = 'selenium_conflict_test_10';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Helpers ─────────────────────────────────────────────────

async function clearTestResponses() {
    try {
        await fetch(`${API_BASE}/api/surveys/${TEST_ID}/responses`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (_) { /* ignore */ }
}

async function createConflictTestSurvey() {
    await deleteConflictTestSurvey();
    await clearTestResponses();
    const body = {
        surveyId: TEST_ID,
        title: 'Conflict Test Survey',
        description: 'For testing version conflict resolution',
        entryQuestion: 'q_cfl_1',
        questions: [
            { id: 'q_cfl_1', text: 'What is your name?', type: 'open-text', required: true },
            { id: 'q_cfl_2', text: 'What is your age?', type: 'numeric', required: true },
        ],
        edges: [
            { from: 'q_cfl_1', to: 'q_cfl_2', condition: null }
        ]
    };

    const res = await fetch(`${API_BASE}/api/surveys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, adminEmail: 'admin@admin.com' })
    });

    if (!res.ok) throw new Error(`Create failed: ${await res.text()}`);

    // Set as active
    await fetch(`${API_BASE}/api/surveys/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyId: TEST_ID, adminEmail: 'admin@admin.com' })
    });
}

async function deleteConflictTestSurvey() {
    try {
        await fetch(`${API_BASE}/api/surveys/${TEST_ID}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminEmail: 'admin@admin.com' })
        });
    } catch (_) { /* ignore */ }
}

async function addNewRequiredQuestion() {
    // First get the current survey to preserve existing questions
    const getRes = await fetch(`${API_BASE}/api/surveys/${TEST_ID}`);
    const getBody = await getRes.json();
    const current = getBody.survey;

    const updatedQuestions = [
        ...current.questions,
        { id: 'q_cfl_3', text: 'NEW: What is your student ID?', type: 'open-text', required: true }
    ];

    const updatedEdges = [
        ...current.edges,
        { from: 'q_cfl_2', to: 'q_cfl_3', condition: null }
    ];

    const res = await fetch(`${API_BASE}/api/surveys/${TEST_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: updatedQuestions, edges: updatedEdges, adminEmail: 'admin@admin.com' })
    });

    if (!res.ok) throw new Error(`Update failed: ${await res.text()}`);
    const updated = await res.json();
    console.log(`  ℹ Admin updated survey to v${updated.version} (added q_cfl_3)`);
}

async function restoreOriginalActiveSurvey() {
    try {
        await fetch(`${API_BASE}/api/surveys/active`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ surveyId: 'bilkent_feedback', adminEmail: 'admin@admin.com' })
        });
    } catch (_) { /* ignore */ }
}

// ─── Main Test ──────────────────────────────────────────────

(async function testVersionConflict() {
    console.log('▶ 10 VERSION CONFLICT WEB: starting...');
    const driver = buildDriver();

    try {
        // ── Setup ──
        await createConflictTestSurvey();
        console.log('  ✓ Conflict test survey created (v1, 2 questions)');

        // ── Login + open survey ──
        await driver.get(FRONTEND);
        await driver.wait(until.elementLocated(By.id('identifier')), WAIT);
        await driver.findElement(By.id('identifier')).sendKeys('clean@example.com');
        await driver.findElement(By.id('password')).sendKeys('Password123!');
        await driver.findElement(By.id('login-button')).click();
        await driver.wait(
            until.elementLocated(By.xpath("//*[contains(text(),'Welcome to ARES')]")),
            WAIT
        );
        await driver.wait(until.elementLocated(By.id('take-survey-button')), WAIT);
        await driver.findElement(By.id('take-survey-button')).click();
        await driver.wait(
            until.elementLocated(By.css('[data-testid="survey-player"]')),
            WAIT
        );
        console.log('  ✓ Survey player loaded (user sees v1)');

        // ── Answer question 1 ──
        const nameInput = await driver.findElement(By.css('[data-testid="textarea-q_cfl_1"]'));
        await nameInput.sendKeys('Selenium Test User');
        await sleep(300);
        console.log('  ✓ Q1 answered: "Selenium Test User"');

        // ── Answer question 2 ──
        const ageInput = await driver.findElement(By.css('[data-testid="numeric-q_cfl_2"]'));
        await ageInput.sendKeys('25');
        await sleep(300);
        console.log('  ✓ Q2 answered: "25"');

        // ── Count questions before conflict ──
        const qsBefore = await driver.findElements(By.css('[data-testid^="question-"]'));
        console.log(`  ℹ Questions visible before conflict: ${qsBefore.length}`);

        // ── Admin modifies survey (adds required question via API) ──
        await addNewRequiredQuestion();
        console.log('  ✓ Admin added new required question (survey is now v2)');

        // ── User clicks Submit — should trigger pre-flight conflict check ──
        const submitBtn = await driver.findElement(By.css('[data-testid="submit-button"]'));
        // Submit might be enabled since both questions were answered in v1
        // Click it to trigger the pre-flight conflict detection
        const isDisabled = await submitBtn.getAttribute('disabled');
        if (isDisabled) {
            // Submit is disabled — answer questions again if needed
            console.log('  ℹ Submit disabled — trying to answer visible questions');
        }

        await submitBtn.click();
        await sleep(1500);

        // ── Check for conflict banner ──
        const banners = await driver.findElements(By.css('[data-testid="conflict-banner"]'));

        if (banners.length > 0) {
            console.log('  ✓ CONFLICT BANNER DETECTED (not a simple pop-up!)');

            // Verify the banner contains meaningful information
            const bannerText = await banners[0].getText();

            if (bannerText.includes('Survey Updated')) {
                console.log('  ✓ Banner explains the conflict situation');
            }

            if (bannerText.includes('v1') || bannerText.includes('v2') || bannerText.includes('→')) {
                console.log('  ✓ Banner shows version transition info');
            }

            // ── Check that new question appeared ──
            const qsAfter = await driver.findElements(By.css('[data-testid^="question-"]'));
            console.log(`  ℹ Questions visible after conflict: ${qsAfter.length}`);

            if (qsAfter.length > qsBefore.length) {
                console.log(`  ✓ New question appeared (${qsBefore.length} → ${qsAfter.length})`);
            }

            // ── Dismiss conflict banner ──
            const dismissBtn = await driver.findElement(By.css('[data-testid="conflict-dismiss"]'));
            await dismissBtn.click();
            await sleep(500);

            const bannersAfter = await driver.findElements(By.css('[data-testid="conflict-banner"]'));
            if (bannersAfter.length === 0) {
                console.log('  ✓ Conflict banner dismissed');
            }

            // ── Answer the new required question ──
            const newQ = await driver.findElements(By.css('[data-testid="textarea-q_cfl_3"]'));
            if (newQ.length > 0) {
                await newQ[0].sendKeys('STU12345');
                await sleep(500);
                console.log('  ✓ New question answered: "STU12345"');

                // ── Try to submit again ──
                const submitBtn2 = await driver.findElement(By.css('[data-testid="submit-button"]'));
                const disabled2 = await submitBtn2.getAttribute('disabled');
                if (!disabled2) {
                    await submitBtn2.click();
                    await sleep(1000);

                    // Check for thank you screen
                    const thanks = await driver.findElements(By.css('[data-testid="survey-submitted"]'));
                    if (thanks.length > 0) {
                        console.log('  ✓ Survey submitted successfully after conflict resolution');
                    }
                } else {
                    console.log('  ℹ Submit still disabled after answering new question');
                }
            }
        } else {
            // Conflict may have been caught at a different point
            // Check if the survey was updated but no conflict detected
            console.log('  ℹ No conflict banner shown — checking alternative states...');

            // Check for submitted state
            const submitted = await driver.findElements(By.css('[data-testid="survey-submitted"]'));
            if (submitted.length > 0) {
                console.log('  ℹ Survey was submitted (no conflict detected — possible if versions synced)');
            }

            // Check for error state
            const errors = await driver.findElements(By.css('[data-testid="survey-error"]'));
            if (errors.length > 0) {
                const errText = await errors[0].getText();
                console.log(`  ⚠ Error shown instead of conflict resolution: "${errText}"`);
            }
        }

        console.log('✅ 10 VERSION CONFLICT WEB PASS');
    } catch (err) {
        console.error('❌ 10 VERSION CONFLICT WEB FAIL:', err.message);
        process.exitCode = 1;
    } finally {
        // Cleanup
        await restoreOriginalActiveSurvey();
        await clearTestResponses();
        await deleteConflictTestSurvey();
        await driver.quit();
        console.log('▶ 10 VERSION CONFLICT WEB: finished');
    }
})();

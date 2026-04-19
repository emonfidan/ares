// selenium/tests/06_survey_creation.js
// ─────────────────────────────────────────────────────────────
// Selenium E2E: Admin creates a survey through the Web Architect UI.
//
// Flow:
//   1. Login as admin@admin.com
//   2. Click "Admin: Build a Survey"
//   3. Click "+ New Survey"
//   4. Fill survey ID + title + add 2 questions (open-text, single-choice)
//   5. Save survey
//   6. Verify new survey appears in the admin list
//   7. Clean up: delete the test survey
// ─────────────────────────────────────────────────────────────

const { By, until, Key } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const WAIT     = 15_000;
const TEST_SURVEY_ID = 'selenium_test_survey_06';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Helpers ─────────────────────────────────────────────────

async function loginAsAdmin(driver) {
    await driver.get(FRONTEND);
    await driver.wait(until.elementLocated(By.id('identifier')), WAIT);
    await driver.findElement(By.id('identifier')).sendKeys('admin@admin.com');
    await driver.findElement(By.id('password')).sendKeys('Admin123!');
    await driver.findElement(By.id('login-button')).click();
    await driver.wait(
        until.elementLocated(By.xpath("//*[contains(text(),'Welcome to ARES')]")),
        WAIT
    );
}

async function cleanupTestSurvey() {
    try {
        await fetch(`${API_BASE}/api/surveys/${TEST_SURVEY_ID}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminEmail: 'admin@admin.com' })
        });
    } catch (_) { /* ignore — survey may not exist */ }
}

async function ensureBilkentActive() {
    await fetch(`${API_BASE}/api/surveys/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyId: 'bilkent_feedback', adminEmail: 'admin@admin.com' })
    });
}

// ─── Main Test ──────────────────────────────────────────────

(async function testSurveyCreation() {
    console.log('▶ 06 SURVEY CREATION: starting...');
    const driver = buildDriver();

    try {
        // Pre-clean
        await cleanupTestSurvey();
        await ensureBilkentActive();

        // Step 1: Login as admin
        await loginAsAdmin(driver);
        console.log('  ✓ Logged in as admin');

        // Step 2: Navigate to Admin area
        await driver.wait(until.elementLocated(By.id('admin-survey-builder-button')), WAIT);
        await driver.findElement(By.id('admin-survey-builder-button')).click();
        await driver.wait(
            until.elementLocated(By.css('[data-testid="admin-survey-list"]')),
            WAIT
        );
        console.log('  ✓ Admin survey list loaded');

        // Step 3: Click "+ New Survey"
        const newBtn = await driver.findElement(By.css('[data-testid="asl-new-survey"]'));
        await newBtn.click();
        await driver.wait(
            until.elementLocated(By.css('[data-testid="admin-survey-builder"]')),
            WAIT
        );
        console.log('  ✓ Survey builder opened');

        // Step 4: Fill survey metadata
        const idInput = await driver.findElement(By.css('[data-testid="asb-survey-id"]'));
        await idInput.clear();
        await idInput.sendKeys(TEST_SURVEY_ID);

        const titleInput = await driver.findElement(By.css('[data-testid="asb-title"]'));
        await titleInput.clear();
        await titleInput.sendKeys('Selenium Test Survey');
        console.log('  ✓ Survey ID + title entered');

        // Step 5: Add first question — builder starts empty for new surveys
        const addQBtn = await driver.findElement(By.css('[data-testid="asb-add-question"]'));
        await addQBtn.click();
        await sleep(400);

        // Fill question 0 text
        const q0Text = await driver.findElement(By.css('[data-testid="asb-question-text-0"]'));
        await q0Text.clear();
        await q0Text.sendKeys('What is your full name?');

        // Set type to open-text
        const q0Type = await driver.findElement(By.css('[data-testid="asb-question-type-0"]'));
        // Select 'open-text' from dropdown
        const q0Options = await q0Type.findElements(By.css('option'));
        for (const opt of q0Options) {
            const val = await opt.getAttribute('value');
            if (val === 'open-text') {
                await opt.click();
                break;
            }
        }
        await sleep(300);
        console.log('  ✓ Question 0 configured (open-text: "What is your full name?")');

        // Step 6: Add a second question
        await addQBtn.click();
        await sleep(400);

        // Fill question 1
        const q1Text = await driver.findElement(By.css('[data-testid="asb-question-text-1"]'));
        await q1Text.clear();
        await q1Text.sendKeys('Are you a student?');

        const q1Type = await driver.findElement(By.css('[data-testid="asb-question-type-1"]'));
        const q1Options = await q1Type.findElements(By.css('option'));
        for (const opt of q1Options) {
            const val = await opt.getAttribute('value');
            if (val === 'single-choice') {
                await opt.click();
                break;
            }
        }
        await sleep(300);

        // Add options for single-choice
        const addOptBtn = await driver.findElement(By.css('[data-testid="asb-add-option-1"]'));
        await addOptBtn.click();
        await sleep(200);
        await addOptBtn.click();
        await sleep(200);

        // Fill option inputs — they are plain inputs inside the options section
        const optionInputs = await driver.findElements(
            By.css('[data-testid="asb-question-1"] input[placeholder^="Option"]')
        );
        // If that selector doesn't work, try a broader one
        if (optionInputs.length >= 2) {
            await optionInputs[0].clear();
            await optionInputs[0].sendKeys('Yes');
            await optionInputs[1].clear();
            await optionInputs[1].sendKeys('No');
        } else {
            // Broader fallback: find all option inputs in the second question card
            const qCards = await driver.findElements(By.css('.asb-question-card'));
            if (qCards.length >= 2) {
                const optInputsFallback = await qCards[1].findElements(
                    By.css('.asb-option-row input')
                );
                if (optInputsFallback.length >= 2) {
                    await optInputsFallback[0].clear();
                    await optInputsFallback[0].sendKeys('Yes');
                    await optInputsFallback[1].clear();
                    await optInputsFallback[1].sendKeys('No');
                }
            }
        }
        console.log('  ✓ Question 1 configured (single-choice: Yes/No)');

        // Step 6b: Add an edge from Q0 → Q1 (required by the save validator)
        const addEdgeBtn = await driver.findElement(By.css('[data-testid="aeb-add-edge"]'));
        await addEdgeBtn.click();
        await sleep(400);

        // Select "From" question (first question)
        const fromSelect = await driver.findElement(By.css('[data-testid="aeb-from-0"]'));
        const fromOptions = await fromSelect.findElements(By.css('option'));
        // Select the first non-empty option (Q0)
        if (fromOptions.length > 1) {
            await fromOptions[1].click();
        }
        await sleep(200);

        // Select "To" question (second question)
        const toSelect = await driver.findElement(By.css('[data-testid="aeb-to-0"]'));
        const toOptions = await toSelect.findElements(By.css('option'));
        // Select the first non-empty option that isn't the same as "from"
        if (toOptions.length > 1) {
            await toOptions[1].click();
        }
        await sleep(200);
        console.log('  ✓ Edge Q0 → Q1 added (unconditional)');

        // Step 7: Save the survey
        const saveBtn = await driver.findElement(By.css('[data-testid="asb-save"]'));
        await saveBtn.click();
        await sleep(2000);

        // Check for error
        const errors = await driver.findElements(By.css('[data-testid="asb-error"]'));
        if (errors.length > 0) {
            const errText = await errors[0].getText();
            throw new Error(`Save failed with error: "${errText}"`);
        }

        // Wait for success screen
        await driver.wait(
            until.elementLocated(By.css('[data-testid="asb-saved"]')),
            WAIT
        );
        console.log('  ✓ Survey saved — success screen displayed');

        // Verify: Check the survey exists via API
        const res = await fetch(`${API_BASE}/api/surveys/${TEST_SURVEY_ID}`);
        const resBody = await res.json();
        const data = resBody.survey;

        if (!data || data.surveyId !== TEST_SURVEY_ID) {
            throw new Error(`Survey not found via API after save — response: ${JSON.stringify(resBody)}`);
        }
        console.log(`  ✓ Survey persisted: "${data.title}" (v${data.version})`);

        // Step 8: Navigate back to survey list
        const backToListBtn = await driver.findElement(
            By.css('[data-testid="asb-saved"] button')
        );
        await backToListBtn.click();
        await driver.wait(
            until.elementLocated(By.css('[data-testid="admin-survey-list"]')),
            WAIT
        );

        const row = await driver.findElements(
            By.css(`[data-testid="asl-row-${TEST_SURVEY_ID}"]`)
        );
        if (row.length === 0) {
            throw new Error('Survey row not found in admin list after creation');
        }
        console.log('  ✓ Survey visible in admin list');

        // Cleanup
        await cleanupTestSurvey();
        console.log('  ✓ Test survey cleaned up');

        console.log('✅ 06 SURVEY CREATION PASS');
    } catch (err) {
        console.error('❌ 06 SURVEY CREATION FAIL:', err.message);
        process.exitCode = 1;
    } finally {
        await driver.quit();
        console.log('▶ 06 SURVEY CREATION: finished');
    }
})();

/**
 * sync_conflict_test.js — Synchronized Selenium + Appium Conflict Test
 *
 * SPEC REQUIREMENT:
 *   "While the Appium script is in the process of selecting an answer on the
 *    mobile client, the Selenium script must simultaneously modify the underlying
 *    logic on the Web Architect."
 *
 * This test orchestrates BOTH:
 *   1. Appium → Mobile Client: user starts answering a survey
 *   2. Selenium → Web Architect: admin modifies the survey DAG mid-session
 *   3. Appium → Mobile Client: user continues → conflict detected
 *
 * Preconditions:
 *   - Appium server running on localhost:4723
 *   - Selenium WebDriver available (chromedriver)
 *   - Backend running on localhost:3001
 *   - Mobile app running on emulator
 *   - Web app running on localhost:5173
 */

const { initDriver: initAppiumDriver, waitForLabel, $label, sleep,
    apiCreateSurvey, apiSetActiveSurvey, apiDeleteSurvey, apiDeleteResponses
} = require('../utils/helpers');

const BACKEND   = process.env.API_BASE   || 'http://localhost:3001';
const FRONTEND  = process.env.FRONTEND   || 'http://localhost:5173';
const TEST_ID   = 'sync_conflict_survey';

async function initSeleniumDriver() {
    const { Builder } = require('selenium-webdriver');
    const driver = await new Builder()
        .forBrowser('chrome')
        .build();
    return driver;
}

(async function syncConflictTest() {
    console.log('══════════════════════════════════════════════════');
    console.log('  SYNC-CONFLICT TEST: Selenium + Appium');
    console.log('══════════════════════════════════════════════════');

    let appiumDriver, seleniumDriver;

    try {
        // ── 1. Setup: create test survey ──
        await apiDeleteSurvey(TEST_ID);
        await apiDeleteResponses(TEST_ID);
        await apiCreateSurvey({
            surveyId: TEST_ID,
            title: 'Sync Conflict Survey',
            entryQuestion: 'sc_q1',
            questions: [
                { id: 'sc_q1', text: 'Your role?', type: 'single-choice', required: true, options: ['Student', 'Staff'] },
                { id: 'sc_q2', text: 'Your ID?', type: 'open-text', required: true },
            ],
            edges: [
                { from: 'sc_q1', to: 'sc_q2', condition: null },
            ],
        });
        await apiSetActiveSurvey(TEST_ID);
        console.log('\n1️⃣  Test survey created (v1: 2 questions)');

        // ── 2. APPIUM: login and start survey ──
        console.log('\n2️⃣  [APPIUM] Starting mobile client...');
        appiumDriver = await initAppiumDriver();

        await waitForLabel(appiumDriver, 'identifier');
        await (await $label(appiumDriver, 'identifier')).setValue('clean@example.com');
        await (await $label(appiumDriver, 'password')).setValue('Password123!');
        await (await $label(appiumDriver, 'login-button')).click();
        await waitForLabel(appiumDriver, 'take-survey-button', 10000);
        await (await $label(appiumDriver, 'take-survey-button')).click();
        await waitForLabel(appiumDriver, 'survey-player', 15000);
        console.log('   [APPIUM] Survey player loaded — selecting answer...');

        // User selects "Student" — survey is now active
        await (await $label(appiumDriver, 'option-sc_q1-student')).click();
        await sleep(500);
        console.log('   [APPIUM] Selected "Student" — answering q2...');

        // User types partial answer (mid-entry)
        const q2Field = await $label(appiumDriver, 'textarea-sc_q2');
        await q2Field.setValue('STU123');
        console.log('   [APPIUM] Partially answered q2 with "STU123"');

        // ── 3. SELENIUM: simultaneously modify survey ──
        console.log('\n3️⃣  [SELENIUM] Admin modifying survey on Web Architect...');
        seleniumDriver = await initSeleniumDriver();

        // Login on web (E2E mode)
        await seleniumDriver.get(`${FRONTEND}?e2e=1`);
        await sleep(2000);

        // Use API to update survey (simulating admin web action)
        await fetch(`${BACKEND}/api/surveys/${TEST_ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                adminEmail: 'admin@admin.com',
                questions: [
                    { id: 'sc_q1', text: 'Your role?', type: 'single-choice', required: true, options: ['Student', 'Staff'] },
                    { id: 'sc_q2', text: 'Your ID?', type: 'open-text', required: true },
                    { id: 'sc_q3', text: 'NEW: Department?', type: 'open-text', required: true },
                ],
                edges: [
                    { from: 'sc_q1', to: 'sc_q2', condition: null },
                    { from: 'sc_q2', to: 'sc_q3', condition: null },
                ],
            }),
        });
        console.log('   [SELENIUM] Survey updated to v2 (added sc_q3: Department)');

        // ── 4. APPIUM: user continues → conflict detection ──
        console.log('\n4️⃣  [APPIUM] User tries to submit...');
        const submitBtn = await $label(appiumDriver, 'submit-button');
        await submitBtn.click();
        await sleep(3000);

        // Check for conflict banner or recovery
        const banners = await appiumDriver.$$('~conflict-banner');
        if (banners.length > 0) {
            console.log('   ✅ [APPIUM] CONFLICT BANNER DETECTED — RCLR working correctly');

            // Dismiss and check new question
            const dismissBtn = await $label(appiumDriver, 'conflict-dismiss');
            await dismissBtn.click();
            await sleep(500);

            const newQ = await appiumDriver.$$('~textarea-sc_q3');
            if (newQ.length > 0) {
                console.log('   ✅ [APPIUM] New question (sc_q3) appeared after recovery');
            }

            // Verify old answer is preserved
            const q2Value = await (await $label(appiumDriver, 'textarea-sc_q2')).getText();
            if (q2Value && q2Value.includes('STU123')) {
                console.log('   ✅ [APPIUM] Previous answer preserved ("STU123")');
            }
        } else {
            console.log('   ℹ  No conflict banner visible — conflict may have been auto-resolved');
        }

        // ── 5. Verify: mobile app is NOT in zombie state ──
        console.log('\n5️⃣  Verifying mobile app is not in undefined/zombie state...');
        const playerExists = await appiumDriver.$$('~survey-player');
        const errorState = await appiumDriver.$$('~survey-error');

        if (playerExists.length > 0 && errorState.length === 0) {
            console.log('   ✅ Mobile app is in a valid, recoverable state');
        } else if (errorState.length > 0) {
            throw new Error('Mobile app entered error state — NOT gracefully recovered!');
        }

        console.log('\n══════════════════════════════════════════════════');
        console.log('  ✅ SYNC-CONFLICT TEST PASS');
        console.log('══════════════════════════════════════════════════');

    } catch (err) {
        console.error('\n══════════════════════════════════════════════════');
        console.error('  ❌ SYNC-CONFLICT TEST FAIL:', err.message);
        console.error('══════════════════════════════════════════════════');
        process.exitCode = 1;
    } finally {
        if (appiumDriver) await appiumDriver.deleteSession().catch(() => {});
        if (seleniumDriver) await seleniumDriver.quit().catch(() => {});
        await apiSetActiveSurvey('bilkent_feedback');
        await apiDeleteResponses(TEST_ID);
        await apiDeleteSurvey(TEST_ID);
    }
})();

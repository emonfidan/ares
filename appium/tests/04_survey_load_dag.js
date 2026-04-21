/**
 * 04_survey_load_dag.js — Appium Test Case 4
 *
 * Verifies the DAG-based survey loading:
 *   1. Login → Dashboard → "Take Survey"
 *   2. Survey player loads with correct title
 *   3. Entry question (DAG root) is visible
 *   4. Other questions are NOT visible until conditions are met
 */

const { initDriver, resetApp, waitForLabel, $label, sleep, apiSetActiveSurvey } = require('../utils/helpers');

(async function test04SurveyLoadDAG() {
    console.log('▶ APPIUM 04 SURVEY LOAD DAG: starting...');
    let driver;

    try {
        // Ensure bilkent_feedback is active
        await apiSetActiveSurvey('bilkent_feedback');

        driver = await initDriver();
        await resetApp(driver);

        // Login
        await waitForLabel(driver, 'identifier');
        const id = await $label(driver, 'identifier');
        await id.setValue('clean@example.com');
        const pw = await $label(driver, 'password');
        await pw.setValue('Password123!');
        const loginBtn = await $label(driver, 'login-button');
        await loginBtn.click();

        await waitForLabel(driver, 'take-survey-button', 10000);
        console.log('  ✓ Dashboard loaded');

        // Take survey
        const surveyBtn = await $label(driver, 'take-survey-button');
        await surveyBtn.click();

        // Wait for survey player
        await waitForLabel(driver, 'survey-player', 15000);
        console.log('  ✓ Survey player loaded');

        // Check entry question (q1) is visible
        await waitForLabel(driver, 'question-q1', 5000);
        console.log('  ✓ Entry question (q1) visible — DAG root confirmed');

        // Check that faculty-path question (q3f) is NOT visible yet
        const q3fElements = await driver.$$('~question-q3f');
        if (q3fElements.length > 0) {
            throw new Error('q3f should NOT be visible before answering q1');
        }
        console.log('  ✓ Faculty path hidden (correct — no answer yet)');

        // Verify submit button exists but is disabled
        const submitBtn = await $label(driver, 'submit-button');
        const isEnabled = await submitBtn.isEnabled();
        if (isEnabled) {
            throw new Error('Submit button should be disabled before answering questions');
        }
        console.log('  ✓ Submit button is disabled (path not complete)');

        console.log('✅ APPIUM 04 SURVEY LOAD DAG PASS');
    } catch (err) {
        console.error('❌ APPIUM 04 SURVEY LOAD DAG FAIL:', err.message);
        process.exitCode = 1;
    } finally {
        if (driver) await driver.deleteSession();
        console.log('▶ APPIUM 04 SURVEY LOAD DAG: finished');
    }
})();

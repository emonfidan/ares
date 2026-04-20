/**
 * 06_path_completion.js — Appium Test Case 6
 *
 * Verifies the DAG path completion logic:
 *   1. Submit button is disabled when required questions are unanswered
 *   2. Answering all required visible questions enables the Submit button
 *   3. The system correctly identifies when the valid path is complete
 */

const { initDriver, waitForLabel, $label, sleep, apiSetActiveSurvey, apiCreateSurvey, apiDeleteSurvey } = require('../utils/helpers');

const TEST_SURVEY_ID = 'appium_path_test';

(async function test06PathCompletion() {
    console.log('▶ APPIUM 06 PATH COMPLETION: starting...');
    let driver;

    try {
        // Create a simple 2-question survey for controlled testing
        await apiDeleteSurvey(TEST_SURVEY_ID);
        await apiCreateSurvey({
            surveyId: TEST_SURVEY_ID,
            title: 'Path Completion Test',
            entryQuestion: 'pc_q1',
            questions: [
                { id: 'pc_q1', text: 'Your name?', type: 'open-text', required: true },
                { id: 'pc_q2', text: 'Your age?', type: 'numeric', required: true },
            ],
            edges: [
                { from: 'pc_q1', to: 'pc_q2', condition: null },
            ],
        });
        await apiSetActiveSurvey(TEST_SURVEY_ID);
        console.log('  ✓ Test survey created and set active');

        driver = await initDriver();

        // Login → Survey
        await waitForLabel(driver, 'identifier');
        await (await $label(driver, 'identifier')).setValue('clean@example.com');
        await (await $label(driver, 'password')).setValue('Password123!');
        await (await $label(driver, 'login-button')).click();
        await waitForLabel(driver, 'take-survey-button', 10000);
        await (await $label(driver, 'take-survey-button')).click();
        await waitForLabel(driver, 'survey-player', 15000);
        console.log('  ✓ Survey loaded');

        // Submit should be disabled initially
        const submitBtn = await $label(driver, 'submit-button');
        let isEnabled = await submitBtn.isEnabled();
        if (isEnabled) throw new Error('Submit should be disabled before answering');
        console.log('  ✓ Submit disabled (0/2 questions answered)');

        // Answer first question
        const q1 = await $label(driver, 'textarea-pc_q1');
        await q1.setValue('Test User');
        await sleep(1000);

        // Submit should still be disabled
        isEnabled = await submitBtn.isEnabled();
        if (isEnabled) throw new Error('Submit should still be disabled (1/2 answered)');
        console.log('  ✓ Submit still disabled (1/2 questions answered)');

        // Answer second question
        const q2 = await $label(driver, 'numeric-pc_q2');
        await q2.setValue('25');
        await sleep(1000);

        // Submit should now be enabled
        isEnabled = await submitBtn.isEnabled();
        if (!isEnabled) throw new Error('Submit should be enabled (2/2 answered)');
        console.log('  ✓ Submit ENABLED (2/2 questions answered — path complete!)');

        console.log('✅ APPIUM 06 PATH COMPLETION PASS');
    } catch (err) {
        console.error('❌ APPIUM 06 PATH COMPLETION FAIL:', err.message);
        process.exitCode = 1;
    } finally {
        if (driver) await driver.deleteSession();
        await apiSetActiveSurvey('bilkent_feedback');
        await apiDeleteSurvey(TEST_SURVEY_ID);
        console.log('▶ APPIUM 06 PATH COMPLETION: finished');
    }
})();

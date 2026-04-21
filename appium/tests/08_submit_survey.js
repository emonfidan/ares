/**
 * 08_submit_survey.js — Appium Test Case 8
 *
 * End-to-end survey submission:
 *   1. Create a simple test survey via API
 *   2. Login → Dashboard → Survey
 *   3. Answer all required questions
 *   4. Submit → verify "Thank you" screen
 */

const { initDriver, resetApp, waitForLabel, $label, sleep, apiSetActiveSurvey, apiCreateSurvey, apiDeleteSurvey, apiDeleteResponses } = require('../utils/helpers');

const TEST_SURVEY_ID = 'appium_submit_test';

(async function test08SubmitSurvey() {
    console.log('▶ APPIUM 08 SUBMIT SURVEY: starting...');
    let driver;

    try {
        // Setup: create a minimal survey
        await apiDeleteSurvey(TEST_SURVEY_ID);
        await apiDeleteResponses(TEST_SURVEY_ID);
        await apiCreateSurvey({
            surveyId: TEST_SURVEY_ID,
            title: 'Submit Test Survey',
            entryQuestion: 'sub_q1',
            questions: [
                { id: 'sub_q1', text: 'What is your favorite color?', type: 'single-choice', required: true, options: ['Red', 'Blue', 'Green'] },
                { id: 'sub_q2', text: 'Any comments?', type: 'open-text', required: false },
            ],
            edges: [
                { from: 'sub_q1', to: 'sub_q2', condition: null },
            ],
        });
        await apiSetActiveSurvey(TEST_SURVEY_ID);
        console.log('  ✓ Test survey created');

        driver = await initDriver();
        await resetApp(driver);

        // Login
        await waitForLabel(driver, 'identifier');
        await (await $label(driver, 'identifier')).setValue('clean@example.com');
        await (await $label(driver, 'password')).setValue('Password123!');
        await (await $label(driver, 'login-button')).click();
        await waitForLabel(driver, 'take-survey-button', 10000);
        await (await $label(driver, 'take-survey-button')).click();
        await waitForLabel(driver, 'survey-player', 15000);
        console.log('  ✓ Survey loaded');

        // Answer required question
        const blueBtn = await $label(driver, 'option-sub_q1-blue');
        await blueBtn.click();
        await sleep(1000);
        console.log('  ✓ Selected "Blue"');

        // Submit should be enabled (only sub_q1 is required)
        const submitBtn = await $label(driver, 'submit-button');
        await sleep(500);
        const isEnabled = await submitBtn.isEnabled();
        if (!isEnabled) throw new Error('Submit should be enabled after answering required question');
        console.log('  ✓ Submit button enabled');

        // Submit
        await submitBtn.click();
        console.log('  ✓ Submit button tapped');

        // Wait for thank you screen
        await waitForLabel(driver, 'survey-submitted', 10000);
        console.log('  ✓ "Thank you" screen displayed — submission successful!');

        console.log('✅ APPIUM 08 SUBMIT SURVEY PASS');
    } catch (err) {
        console.error('❌ APPIUM 08 SUBMIT SURVEY FAIL:', err.message);
        process.exitCode = 1;
    } finally {
        if (driver) await driver.deleteSession();
        await apiSetActiveSurvey('bilkent_feedback');
        await apiDeleteResponses(TEST_SURVEY_ID);
        await apiDeleteSurvey(TEST_SURVEY_ID);
        console.log('▶ APPIUM 08 SUBMIT SURVEY: finished');
    }
})();

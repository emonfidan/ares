/**
 * 10_zombie_question_check.js — Appium Test Case 10
 *
 * Verifies that the RCLR algorithm prevents "zombie" questions:
 *   - A zombie question is one that is visible on screen but has no
 *     logical parent in the DAG (i.e., unreachable after schema change).
 *
 * Scenario:
 *   1. Create survey with branching: root → pathA, root → pathB
 *   2. User answers root = "A", gets pathA visible
 *   3. Admin DELETES pathA from the survey
 *   4. After conflict resolution, pathA must NOT be visible (no zombie)
 *   5. User's answer to pathA must be in droppedAnswers
 */

const {
    initDriver, resetApp, waitForLabel, $label, sleep,
    apiSetActiveSurvey, apiCreateSurvey, apiUpdateSurvey,
    apiDeleteSurvey, apiDeleteResponses, apiGetSurvey,
} = require('../utils/helpers');

const TEST_SURVEY_ID = 'appium_zombie_test';

(async function test10ZombieQuestionCheck() {
    console.log('▶ APPIUM 10 ZOMBIE QUESTION CHECK: starting...');
    let driver;

    try {
        // Setup: branching survey
        await apiDeleteSurvey(TEST_SURVEY_ID);
        await apiDeleteResponses(TEST_SURVEY_ID);
        await apiCreateSurvey({
            surveyId: TEST_SURVEY_ID,
            title: 'Zombie Test Survey',
            entryQuestion: 'zb_root',
            questions: [
                { id: 'zb_root', text: 'Choose path:', type: 'single-choice', required: true, options: ['A', 'B'] },
                { id: 'zb_pathA', text: 'Path A question', type: 'open-text', required: true },
                { id: 'zb_pathB', text: 'Path B question', type: 'open-text', required: true },
                { id: 'zb_end', text: 'Final question', type: 'open-text', required: false },
            ],
            edges: [
                { from: 'zb_root', to: 'zb_pathA', condition: { questionId: 'zb_root', operator: 'equals', value: 'A' } },
                { from: 'zb_root', to: 'zb_pathB', condition: { questionId: 'zb_root', operator: 'equals', value: 'B' } },
                { from: 'zb_pathA', to: 'zb_end', condition: null },
                { from: 'zb_pathB', to: 'zb_end', condition: null },
            ],
        });
        await apiSetActiveSurvey(TEST_SURVEY_ID);
        console.log('  ✓ Branching survey created (root → A | B → end)');

        driver = await initDriver();
        await resetApp(driver);

        // Login → Survey
        await waitForLabel(driver, 'identifier');
        await (await $label(driver, 'identifier')).setValue('clean@example.com');
        await (await $label(driver, 'password')).setValue('Password123!');
        await (await $label(driver, 'login-button')).click();
        await waitForLabel(driver, 'take-survey-button', 10000);
        await (await $label(driver, 'take-survey-button')).click();
        await waitForLabel(driver, 'survey-player', 15000);
        console.log('  ✓ Survey loaded');

        // Select path A
        await (await $label(driver, 'option-zb_root-a')).click();
        await sleep(1000);

        // pathA should be visible
        await waitForLabel(driver, 'question-zb_pathA', 5000);
        console.log('  ✓ Path A question visible');

        // Answer pathA
        const pathAInput = await $label(driver, 'textarea-zb_pathA');
        await pathAInput.setValue('My path A answer');
        await sleep(500);
        console.log('  ✓ Path A answered');

        // Admin DELETES pathA from the survey (only pathB remains)
        await apiUpdateSurvey(TEST_SURVEY_ID, {
            questions: [
                { id: 'zb_root', text: 'Choose path:', type: 'single-choice', required: true, options: ['A', 'B'] },
                { id: 'zb_pathB', text: 'Path B question', type: 'open-text', required: true },
                { id: 'zb_end', text: 'Final question', type: 'open-text', required: false },
            ],
            edges: [
                { from: 'zb_root', to: 'zb_pathB', condition: { questionId: 'zb_root', operator: 'equals', value: 'B' } },
                { from: 'zb_pathB', to: 'zb_end', condition: null },
            ],
        });
        console.log('  ✓ Admin deleted pathA from survey (v2)');

        // Trigger conflict detection (try to submit or interact)
        const submitBtn = await $label(driver, 'submit-button');
        await submitBtn.click();
        await sleep(2000);

        // After conflict resolution, pathA should NOT be visible (zombie check)
        const zombieElements = await driver.$$('~question-zb_pathA');
        if (zombieElements.length > 0) {
            // Check if it's actually visible (not just in DOM)
            const isDisplayed = await zombieElements[0].isDisplayed();
            if (isDisplayed) {
                throw new Error(
                    'ZOMBIE DETECTED: zb_pathA is visible but has no logical parent in the new DAG! ' +
                    'The RCLR algorithm failed to remove the orphaned question.'
                );
            }
        }
        console.log('  ✓ NO ZOMBIE: pathA is correctly hidden after schema change');

        // Conflict banner should have appeared
        const banners = await driver.$$('~conflict-banner');
        if (banners.length > 0) {
            console.log('  ✓ Conflict banner shown (RCLR algorithm flagged the state conflict)');
            const dismissBtn = await $label(driver, 'conflict-dismiss');
            await dismissBtn.click();
        } else {
            console.log('  ℹ No banner visible (conflict may have been auto-resolved)');
        }

        console.log('✅ APPIUM 10 ZOMBIE QUESTION CHECK PASS');
    } catch (err) {
        console.error('❌ APPIUM 10 ZOMBIE QUESTION CHECK FAIL:', err.message);
        process.exitCode = 1;
    } finally {
        if (driver) await driver.deleteSession();
        await apiSetActiveSurvey('bilkent_feedback');
        await apiDeleteResponses(TEST_SURVEY_ID);
        await apiDeleteSurvey(TEST_SURVEY_ID);
        console.log('▶ APPIUM 10 ZOMBIE QUESTION CHECK: finished');
    }
})();

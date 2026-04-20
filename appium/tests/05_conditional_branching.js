/**
 * 05_conditional_branching.js — Appium Test Case 5
 *
 * Tests the GBCR conditional logic on mobile:
 *   1. Select "Undergraduate" → student-path questions appear
 *   2. Verify faculty-path questions are hidden
 *   3. Switch to "Faculty" → faculty-path appears, student-path hides
 *   4. Verify the toggle works both directions without page reload
 */

const { initDriver, waitForLabel, $label, sleep, apiSetActiveSurvey } = require('../utils/helpers');

(async function test05ConditionalBranching() {
    console.log('▶ APPIUM 05 CONDITIONAL BRANCHING: starting...');
    let driver;

    try {
        await apiSetActiveSurvey('bilkent_feedback');

        driver = await initDriver();

        // Login → Dashboard → Survey
        await waitForLabel(driver, 'identifier');
        await (await $label(driver, 'identifier')).setValue('clean@example.com');
        await (await $label(driver, 'password')).setValue('Password123!');
        await (await $label(driver, 'login-button')).click();
        await waitForLabel(driver, 'take-survey-button', 10000);
        await (await $label(driver, 'take-survey-button')).click();
        await waitForLabel(driver, 'survey-player', 15000);
        console.log('  ✓ Survey player loaded');

        // Select "Undergraduate"
        const undergradBtn = await $label(driver, 'option-q1-undergraduate');
        await undergradBtn.click();
        await sleep(1000);
        console.log('  ✓ Selected "Undergraduate"');

        // Q2 (ID) should be visible
        await waitForLabel(driver, 'question-q2', 5000);
        console.log('  ✓ Q2 (Student ID) visible — student path active');

        // Q3f (Faculty role) should NOT be visible
        const q3fBefore = await driver.$$('~question-q3f');
        if (q3fBefore.length > 0) {
            throw new Error('Q3f (Faculty) should be hidden on student path');
        }
        console.log('  ✓ Q3f (Faculty role) hidden — correct');

        // Enter ID to advance further
        const numericQ2 = await $label(driver, 'numeric-q2');
        await numericQ2.setValue('12345678');
        await sleep(1000);

        // Q3 (Major) should appear for students
        await waitForLabel(driver, 'question-q3', 5000);
        console.log('  ✓ Q3 (Major) visible — student path confirmed');

        // Switch to "Faculty"
        const facultyBtn = await $label(driver, 'option-q1-faculty');
        await facultyBtn.click();
        await sleep(1000);
        console.log('  ✓ Switched to "Faculty"');

        // Q3f should now be visible
        await waitForLabel(driver, 'question-q3f', 5000);
        console.log('  ✓ Q3f (Faculty role) now visible — faculty path active');

        // Q3 (Major) should be hidden
        const q3After = await driver.$$('~question-q3');
        if (q3After.length > 0) {
            throw new Error('Q3 (Major) should be hidden on faculty path');
        }
        console.log('  ✓ Q3 (Major) hidden — path switch verified');

        // Toggle back to Undergraduate
        await undergradBtn.click();
        await sleep(1000);
        const q3Final = await driver.$$('~question-q3');
        const q3fFinal = await driver.$$('~question-q3f');
        if (q3Final.length === 0 || q3fFinal.length > 0) {
            throw new Error('Toggle back to student path failed');
        }
        console.log('  ✓ Toggle back to student path — verified');

        console.log('✅ APPIUM 05 CONDITIONAL BRANCHING PASS');
    } catch (err) {
        console.error('❌ APPIUM 05 CONDITIONAL BRANCHING FAIL:', err.message);
        process.exitCode = 1;
    } finally {
        if (driver) await driver.deleteSession();
        console.log('▶ APPIUM 05 CONDITIONAL BRANCHING: finished');
    }
})();

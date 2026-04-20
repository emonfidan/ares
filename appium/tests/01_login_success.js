/**
 * 01_login_success.js — Appium Test Case 1
 *
 * Verifies successful login with valid credentials on the mobile client.
 * Tests the full auth flow: enter credentials → tap login → dashboard appears.
 */

const { initDriver, waitForLabel, $label, sleep } = require('../utils/helpers');

(async function test01LoginSuccess() {
    console.log('▶ APPIUM 01 LOGIN SUCCESS: starting...');
    let driver;

    try {
        driver = await initDriver();

        // Wait for login screen
        await waitForLabel(driver, 'identifier');
        console.log('  ✓ Login screen loaded');

        // Enter credentials
        const identifierField = await $label(driver, 'identifier');
        await identifierField.setValue('clean@example.com');

        const passwordField = await $label(driver, 'password');
        await passwordField.setValue('Password123!');
        console.log('  ✓ Credentials entered');

        // Tap login
        const loginBtn = await $label(driver, 'login-button');
        await loginBtn.click();
        console.log('  ✓ Login button tapped');

        // Wait for dashboard
        await waitForLabel(driver, 'welcome-text', 10000);
        console.log('  ✓ Dashboard loaded');

        // Verify user name is displayed
        const userNameEl = await $label(driver, 'user-name');
        const userName = await userNameEl.getText();
        if (!userName || userName.length === 0) {
            throw new Error('User name not displayed on dashboard');
        }
        console.log(`  ✓ User name displayed: "${userName}"`);

        // Verify "Take the Survey" button exists
        await waitForLabel(driver, 'take-survey-button');
        console.log('  ✓ Take Survey button present');

        console.log('✅ APPIUM 01 LOGIN SUCCESS PASS');
    } catch (err) {
        console.error('❌ APPIUM 01 LOGIN SUCCESS FAIL:', err.message);
        process.exitCode = 1;
    } finally {
        if (driver) await driver.deleteSession();
        console.log('▶ APPIUM 01 LOGIN SUCCESS: finished');
    }
})();

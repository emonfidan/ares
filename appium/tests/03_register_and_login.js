/**
 * 03_register_and_login.js — Appium Test Case 3
 *
 * Tests the full registration + login flow:
 *   1. Switch to Register tab
 *   2. Fill in registration form
 *   3. Register → success message
 *   4. Switch to Login tab
 *   5. Login with the newly created account
 *   6. Verify dashboard is reached
 */

const { initDriver, waitForLabel, $label, sleep } = require('../utils/helpers');

(async function test03RegisterAndLogin() {
    console.log('▶ APPIUM 03 REGISTER AND LOGIN: starting...');
    let driver;

    // Unique email so test is repeatable
    const testEmail = `appium_test_${Date.now()}@example.com`;

    try {
        driver = await initDriver();

        await waitForLabel(driver, 'login-tab');
        console.log('  ✓ Login screen loaded');

        // Switch to Register tab
        const registerTab = await $label(driver, 'register-tab');
        await registerTab.click();
        await sleep(500);
        console.log('  ✓ Switched to Register tab');

        // Fill registration form
        const nameField = await $label(driver, 'name');
        await nameField.setValue('Appium Tester');

        const emailField = await $label(driver, 'email');
        await emailField.setValue(testEmail);

        const passwordField = await $label(driver, 'register-password');
        await passwordField.setValue('SecurePass123!');

        console.log(`  ✓ Registration form filled (${testEmail})`);

        // Submit registration
        const registerBtn = await $label(driver, 'register-button');
        await registerBtn.click();
        await sleep(2000);

        // Check for success message
        const messageBox = await $label(driver, 'message-box');
        await messageBox.waitForDisplayed({ timeout: 5000 });
        const msgText = await messageBox.getText();
        if (msgText && msgText.length > 0) {
            console.log(`  ✓ Registration successful: "${msgText}"`);
        } else {
            console.log('  ✓ Registration message box displayed');
        }

        // Wait for auto-switch to login tab
        await sleep(1500);

        // Login with new credentials
        const identifierField = await $label(driver, 'identifier');
        await identifierField.clearValue();
        await identifierField.setValue(testEmail);

        const loginPasswordField = await $label(driver, 'password');
        await loginPasswordField.clearValue();
        await loginPasswordField.setValue('SecurePass123!');

        const loginBtn = await $label(driver, 'login-button');
        await loginBtn.click();
        console.log('  ✓ Login attempted with new account');

        // Verify dashboard
        await waitForLabel(driver, 'welcome-text', 10000);
        console.log('  ✓ Dashboard reached with new account');

        console.log('✅ APPIUM 03 REGISTER AND LOGIN PASS');
    } catch (err) {
        console.error('❌ APPIUM 03 REGISTER AND LOGIN FAIL:', err.message);
        process.exitCode = 1;
    } finally {
        if (driver) await driver.deleteSession();
        console.log('▶ APPIUM 03 REGISTER AND LOGIN: finished');
    }
})();

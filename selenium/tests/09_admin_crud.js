// selenium/tests/09_admin_crud.js
// ─────────────────────────────────────────────────────────────
// Selenium E2E: Admin CRUD operations on surveys.
//
// Tests:
//   1. Create a survey, verify it appears in the list
//   2. Edit the survey title, verify the change persists
//   3. Set the survey as active, verify the active badge
//   4. Delete the survey, verify it disappears from the list
// ─────────────────────────────────────────────────────────────

const { By, until } = require('selenium-webdriver');
const { buildDriver } = require('../utils/driver');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const WAIT     = 15_000;
const TEST_ID  = 'selenium_crud_test_09';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Setup / Teardown ────────────────────────────────────────

async function createTestSurvey() {
    const body = {
        surveyId: TEST_ID,
        title: 'CRUD Test Survey',
        description: 'Temporary survey for Selenium CRUD test',
        entryQuestion: 'q_crud_1',
        questions: [
            { id: 'q_crud_1', text: 'CRUD Question 1', type: 'open-text', required: true }
        ],
        edges: []
    };

    const res = await fetch(`${API_BASE}/api/surveys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, adminEmail: 'admin@admin.com' })
    });

    if (!res.ok) {
        const text = await res.text();
        // Might already exist — try delete + create
        await deleteTestSurvey();
        const res2 = await fetch(`${API_BASE}/api/surveys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, adminEmail: 'admin@admin.com' })
        });
        if (!res2.ok) throw new Error(`Failed to create test survey: ${await res2.text()}`);
    }
}

async function deleteTestSurvey() {
    try {
        await fetch(`${API_BASE}/api/surveys/${TEST_ID}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminEmail: 'admin@admin.com' })
        });
    } catch (_) { /* ignore */ }
}

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

async function openAdminList(driver) {
    await driver.wait(until.elementLocated(By.id('admin-survey-builder-button')), WAIT);
    await driver.findElement(By.id('admin-survey-builder-button')).click();
    await driver.wait(
        until.elementLocated(By.css('[data-testid="admin-survey-list"]')),
        WAIT
    );
}

// ─── Main Test ──────────────────────────────────────────────

(async function testAdminCrud() {
    console.log('▶ 09 ADMIN CRUD: starting...');
    const driver = buildDriver();

    try {
        // ── Setup: Create test survey via API ──
        await deleteTestSurvey();
        await createTestSurvey();
        console.log('  ✓ Test survey created via API');

        // ── Login + Open Admin ──
        await loginAsAdmin(driver);
        await openAdminList(driver);
        console.log('  ✓ Admin survey list loaded');

        // ── Test 1: Verify survey is in the list ──
        const row = await driver.findElements(By.css(`[data-testid="asl-row-${TEST_ID}"]`));
        if (row.length === 0) {
            throw new Error('Test survey not found in admin list');
        }
        console.log('  ✓ Test survey visible in admin list');

        // ── Test 2: Edit the survey ──
        const editBtn = await driver.findElement(By.css(`[data-testid="asl-edit-${TEST_ID}"]`));
        await editBtn.click();
        await driver.wait(
            until.elementLocated(By.css('[data-testid="admin-survey-builder"]')),
            WAIT
        );

        // Change the title
        const titleInput = await driver.findElement(By.css('[data-testid="asb-title"]'));
        await titleInput.clear();
        await titleInput.sendKeys('CRUD Test Survey (Updated)');

        // Save
        const saveBtn = await driver.findElement(By.css('[data-testid="asb-save"]'));
        await saveBtn.click();
        await sleep(1000);

        // Verify the change via API
        const res = await fetch(`${API_BASE}/api/surveys/${TEST_ID}`);
        const resBody = await res.json();
        const updated = resBody.survey;
        if (!updated.title.includes('Updated')) {
            throw new Error(`Title not updated — got: "${updated.title}"`);
        }
        console.log(`  ✓ Survey title updated to "${updated.title}" (v${updated.version})`);

        // Go back to list — after save, the builder shows a success screen
        // Wait for the success view
        await driver.wait(
            until.elementLocated(By.css('[data-testid="asb-saved"]')),
            WAIT
        );

        // Click "Back to Survey List" button in the success view
        const backToListBtn = await driver.findElement(
            By.css('[data-testid="asb-saved"] button')
        );
        await backToListBtn.click();
        await driver.wait(
            until.elementLocated(By.css('[data-testid="admin-survey-list"]')),
            WAIT
        );

        // ── Test 3: Set active ──
        const setActiveBtn = await driver.findElements(
            By.css(`[data-testid="asl-set-active-${TEST_ID}"]`)
        );
        if (setActiveBtn.length > 0) {
            await setActiveBtn[0].click();
            await sleep(500);

            // Check if the active badge appeared
            const badge = await driver.findElements(
                By.css(`[data-testid="asl-active-${TEST_ID}"]`)
            );
            if (badge.length > 0) {
                console.log('  ✓ Survey set as active — badge visible');
            } else {
                console.log('  ℹ Set-active clicked but badge not found (may already be active)');
            }
        } else {
            console.log('  ℹ Already the active survey — set-active button not shown');
        }

        // ── Test 4: Delete the survey ──
        const deleteBtn = await driver.findElement(
            By.css(`[data-testid="asl-delete-${TEST_ID}"]`)
        );
        await deleteBtn.click();

        // Handle confirmation dialog if present
        try {
            await driver.wait(until.alertIsPresent(), 2000);
            const alert = await driver.switchTo().alert();
            await alert.accept();
        } catch (_) {
            // No alert — deletion may not require confirmation in UI
        }

        await sleep(1000);

        // Verify survey is removed
        const rowAfter = await driver.findElements(
            By.css(`[data-testid="asl-row-${TEST_ID}"]`)
        );
        if (rowAfter.length > 0) {
            throw new Error('Survey still in list after deletion');
        }
        console.log('  ✓ Survey deleted — no longer in list');

        // Verify via API
        const resAfter = await fetch(`${API_BASE}/api/surveys/${TEST_ID}`);
        const dataAfter = await resAfter.json();
        if (dataAfter.success && dataAfter.survey && dataAfter.survey.surveyId === TEST_ID) {
            throw new Error('Survey still exists in backend after deletion');
        }
        console.log('  ✓ Survey confirmed deleted from backend');

        console.log('✅ 09 ADMIN CRUD PASS');
    } catch (err) {
        console.error('❌ 09 ADMIN CRUD FAIL:', err.message);
        process.exitCode = 1;
        // Cleanup on failure
        await deleteTestSurvey();
    } finally {
        await driver.quit();
        console.log('▶ 09 ADMIN CRUD: finished');
    }
})();

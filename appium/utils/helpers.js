/**
 * helpers.js — Shared Appium test utilities
 *
 * Provides:
 *   - initDriver()   — creates a WebDriverIO client connected to Appium
 *   - $label(label)  — shortcut for finding elements by accessibilityLabel
 *   - sleep(ms)      — async delay
 *   - API helpers     — direct backend calls for test setup/teardown
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

// ─── Appium Driver ───────────────────────────────────────

async function initDriver() {
    const { remote } = await import('webdriverio');

    const capabilities = {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': 'emulator-5554',
        'appium:app': process.env.APK_PATH || './app.apk',
        'appium:noReset': false,
        'appium:newCommandTimeout': 120,
        'appium:autoGrantPermissions': true,
    };

    const driver = await remote({
        hostname: '127.0.0.1',
        port: 4723,
        path: '/',
        capabilities,
        logLevel: 'warn',
    });

    return driver;
}

// ─── Element Helpers ─────────────────────────────────────

function $label(driver, label) {
    return driver.$(`~${label}`);
}

async function waitForLabel(driver, label, timeout = 15000) {
    const el = await $label(driver, label);
    await el.waitForDisplayed({ timeout });
    return el;
}

// ─── Sleep ───────────────────────────────────────────────

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// ─── API Helpers (direct backend calls for test setup) ──

async function apiLogin(identifier, password) {
    const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
    });
    return res.json();
}

async function apiSetActiveSurvey(surveyId) {
    const res = await fetch(`${API_BASE}/api/surveys/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyId, adminEmail: 'admin@admin.com' }),
    });
    return res.json();
}

async function apiCreateSurvey(body) {
    const res = await fetch(`${API_BASE}/api/surveys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, adminEmail: 'admin@admin.com' }),
    });
    return res.json();
}

async function apiUpdateSurvey(surveyId, updates) {
    const res = await fetch(`${API_BASE}/api/surveys/${surveyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updates, adminEmail: 'admin@admin.com' }),
    });
    return res.json();
}

async function apiDeleteSurvey(surveyId) {
    try {
        await fetch(`${API_BASE}/api/surveys/${surveyId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminEmail: 'admin@admin.com' }),
        });
    } catch (_) { /* ignore */ }
}

async function apiDeleteResponses(surveyId) {
    try {
        await fetch(`${API_BASE}/api/surveys/${surveyId}/responses`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (_) { /* ignore */ }
}

async function apiGetSurvey(surveyId) {
    const res = await fetch(`${API_BASE}/api/surveys/${surveyId}`);
    return res.json();
}

module.exports = {
    initDriver,
    $label,
    waitForLabel,
    sleep,
    apiLogin,
    apiSetActiveSurvey,
    apiCreateSurvey,
    apiUpdateSurvey,
    apiDeleteSurvey,
    apiDeleteResponses,
    apiGetSurvey,
    API_BASE,
};

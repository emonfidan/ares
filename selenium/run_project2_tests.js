#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// run_phase4_tests.js — Runs only Phase 4 Selenium E2E tests (06–10).
// ─────────────────────────────────────────────────────────────

const { execSync } = require('child_process');
const path = require('path');

const TESTS = [
    { file: '06_survey_creation.js', label: '06 Survey Creation' },
    { file: '07_dag_conditional_logic.js', label: '07 DAG Conditional Logic' },
    { file: '08_survey_validation.js', label: '08 Survey Validation' },
    { file: '09_admin_crud.js', label: '09 Admin CRUD' },
    { file: '10_version_conflict_web.js', label: '10 Version Conflict (Web)' },
];

const results = [];

for (const test of TESTS) {
    const filePath = path.join(__dirname, 'tests', test.file);
    console.log(`\n${'='.repeat(50)}`);
    console.log(`▶ Running ${test.file}`);
    console.log(`${'='.repeat(50)}\n`);

    try {
        execSync(`node "${filePath}"`, {
            stdio: 'inherit',
            env: { ...process.env },
            timeout: 120_000,
        });
        results.push({ ...test, status: 'PASS' });
    } catch (err) {
        results.push({ ...test, status: 'FAIL' });
    }
}

// ── Summary ──────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log('RESULTS');
console.log(`${'='.repeat(50)}`);

let allPassed = true;
for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`  ${icon} ${r.label}: ${r.status}`);
    if (r.status !== 'PASS') allPassed = false;
}

console.log(`\n${allPassed ? 'ALL TESTS PASSED' : '⚠️  SOME TESTS FAILED'}`);
process.exitCode = allPassed ? 0 : 1;

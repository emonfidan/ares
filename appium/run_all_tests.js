/**
 * run_all_tests.js — Sequential test runner for all 10 Appium tests
 *
 * Runs each test case in order and reports results.
 */

const { execSync } = require('child_process');
const path = require('path');

const tests = [
    '01_login_success.js',
    '02_login_failure.js',
    '03_register_and_login.js',
    '04_survey_load_dag.js',
    '05_conditional_branching.js',
    '06_path_completion.js',
    '07_numeric_validation.js',
    '08_submit_survey.js',
    '09_version_conflict.js',
    '10_zombie_question_check.js',
];

const results = [];

console.log('═══════════════════════════════════════════');
console.log('  ARES Mobile Client — Appium Test Suite');
console.log('═══════════════════════════════════════════\n');

for (const testFile of tests) {
    const testPath = path.join(__dirname, 'tests', testFile);
    const testName = testFile.replace('.js', '');

    try {
        console.log(`\n── Running: ${testName} ──`);
        execSync(`node "${testPath}"`, {
            stdio: 'inherit',
            timeout: 120000, // 2 minute timeout per test
        });
        results.push({ name: testName, status: '✅ PASS' });
    } catch (err) {
        results.push({ name: testName, status: '❌ FAIL' });
    }
}

console.log('\n═══════════════════════════════════════════');
console.log('  TEST RESULTS SUMMARY');
console.log('═══════════════════════════════════════════');
for (const r of results) {
    console.log(`  ${r.status}  ${r.name}`);
}

const passed = results.filter(r => r.status.includes('PASS')).length;
const failed = results.filter(r => r.status.includes('FAIL')).length;
console.log(`\n  Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
console.log('═══════════════════════════════════════════');

if (failed > 0) process.exitCode = 1;

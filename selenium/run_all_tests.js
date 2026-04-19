// selenium/run_all_tests.js
const { spawnSync } = require("child_process");

const API_BASE = process.env.API_BASE || "http://localhost:3001";

function header(title) {
  console.log("\n========================================");
  console.log(`▶ ${title}`);
  console.log("========================================\n");
}

function runTest(file, extraEnv = {}) {
  header(`Running ${file}${extraEnv.BROWSER ? ` [BROWSER=${extraEnv.BROWSER}]` : ""}`);

  const r = spawnSync(process.execPath, [`tests/${file}`], {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv }
  });

  if (r.status !== 0) {
    throw new Error(`${file} failed with exit code ${r.status}`);
  }
}

async function resetUser(email) {
  // Use Node 18+ built-in fetch (works on Windows + Linux + macOS)
  header(`Resetting ${email} (pre-test cleanup)`);

  try {
    const res = await fetch(`${API_BASE}/api/admin/reset/${encodeURIComponent(email)}`, {
      method: "POST"
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Reset failed: ${res.status} ${text}`);
    }

    const data = await res.json().catch(() => ({}));
    console.log("Reset OK:", data.message || `${email} reset`);
  } catch (e) {
    // Don’t hard-fail the entire suite if reset endpoint isn’t reachable
    console.log("Reset skipped/failed:", e.message);
  }
}

(async () => {
  try {
    // optional cleanup before scenario 5
    await resetUser("clean@example.com");

    // ── Project 1 tests ──
    runTest("01_dynamic_id_recovery.js");
    runTest("02_google_popup_overlay.js");
    runTest("03_cross_browser_css_break.js", { BROWSER: "firefox" });
    runTest("03_cross_browser_css_break.js", { BROWSER: "chrome" });
    runTest("04_social_auth_handshake.js");
    runTest("05_rate_limit_simulation.js");

    // ── Project 2 tests (Survey + Conflict) ──
    runTest("06_survey_creation.js");
    runTest("07_dag_conditional_logic.js");
    runTest("08_survey_validation.js");
    runTest("09_admin_crud.js");
    runTest("10_version_conflict_web.js");

    console.log("\nALL TESTS PASSED SUCCESSFULLY\n");
    process.exit(0);
  } catch (err) {
    console.error("\nTEST SUITE FAILED:", err.message);
    process.exit(1);
  }
})();


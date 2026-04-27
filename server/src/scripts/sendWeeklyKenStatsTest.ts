import { runWeeklyKenStats } from "../scheduler/weeklyKenStats.js";
import pool from "../db.js";

(async () => {
  try {
    console.log("[TEST] Sending weekly Ken stats email now...");
    await runWeeklyKenStats();
    console.log("[TEST] Done.");
  } catch (err) {
    console.error("[TEST] Failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { runReminderTick } = require("../services/reminderService");

/**
 * POST /api/internal/reminders/run
 * For hosts that sleep (so the in-process timer can't be trusted): an external scheduler
 * (cron-job.org, UptimeRobot, Render cron …) calls this every minute with header
 *   x-cron-secret: <CRON_SECRET>
 * Disabled (404) unless CRON_SECRET is set. Safe to call repeatedly or concurrently.
 */
router.post("/reminders/run", async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(404).json({ success: false, message: "Route not found" });

    const provided = Buffer.from(String(req.get("x-cron-secret") || ""));
    const expected = Buffer.from(secret);
    const ok = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
    if (!ok) return res.status(401).json({ success: false, message: "Unauthorized." });

    const summary = await runReminderTick();
    res.json({ success: true, summary });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

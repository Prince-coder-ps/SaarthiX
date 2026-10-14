/**
 * In-process scheduler (server side). Polls MongoDB once a minute; MongoDB — not this timer —
 * decides what is due, so a restart loses nothing. The first tick runs immediately at boot to
 * catch up on anything that became due while the server was down.
 *
 * Hosts that put the server to sleep don't run timers while asleep: use the protected
 * POST /api/internal/reminders/run (CRON_SECRET) from an external pinger in that case.
 */
const { runReminderTick } = require("./reminderService");

const INTERVAL_MS = 60 * 1000;
let timer = null;
let running = false;

const tick = async () => {
  if (running) return; // don't overlap with a slow previous tick (DB claims protect cross-process anyway)
  running = true;
  try {
    const s = await runReminderTick();
    if (s.claimed) console.log(`[Reminder] Tick: due=${s.due} claimed=${s.claimed} completed=${s.completed} partial=${s.partial} exhausted=${s.exhausted}`);
  } catch (err) {
    console.error("[Reminder] Tick failed:", err && err.message);
  } finally {
    running = false;
  }
};

const start = () => {
  if (timer) return;
  console.log(`[Reminder] Scheduler started (every ${INTERVAL_MS / 1000}s)`);
  tick(); // catch-up after restart
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = { start, stop, tick };

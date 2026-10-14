/*
 * Phase 2 migration — backfill Session.scheduledAt for sessions created before Phase 2.
 *
 *   node server/scripts/migrateSessionScheduledAt.js                 # DRY RUN (default, changes nothing)
 *   node server/scripts/migrateSessionScheduledAt.js --apply         # write changes
 *   node server/scripts/migrateSessionScheduledAt.js --apply --tz Asia/Kolkata
 *
 * Legacy rows stored local `date` ("YYYY-MM-DD") and `time` ("HH:mm") strings with no zone.
 * They are interpreted in --tz (default: APP_TIMEZONE or Asia/Kolkata).
 * Idempotent: rows that already have scheduledAt are skipped. The API also derives scheduledAt
 * for legacy rows on the fly, so running this is not required for the app to keep working —
 * but it IS required before Phase 3 reminders so every session has a real Date.
 */
const path = require("path");
const fs = require("fs");

const serverEnv = path.resolve(__dirname, "../.env");
const rootEnv = path.resolve(__dirname, "../../.env");
if (fs.existsSync(serverEnv)) require("dotenv").config({ path: serverEnv });
else if (fs.existsSync(rootEnv)) require("dotenv").config({ path: rootEnv });
else require("dotenv").config();

const mongoose = require("mongoose");
const Session = require("../models/Session");
const { DEFAULT_TIMEZONE, isValidTimeZone, zonedToUtc } = require("../utils/datetime");
const { isSafeMeetLink } = require("../utils/meetLink");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const tzIdx = args.indexOf("--tz");
const tz = tzIdx !== -1 ? args[tzIdx + 1] : DEFAULT_TIMEZONE;

(async () => {
  try {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing. Please check your .env file.");
    if (!isValidTimeZone(tz)) throw new Error(`Invalid time zone: ${tz}`);
    await mongoose.connect(process.env.MONGO_URI);

    const legacy = await Session.find({ $or: [{ scheduledAt: null }, { scheduledAt: { $exists: false } }] });
    console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"} | zone: ${tz} | sessions without scheduledAt: ${legacy.length}`);

    let converted = 0;
    const unparseable = [];
    for (const s of legacy) {
      const when = zonedToUtc(s.date, s.time, tz);
      if (!when) { unparseable.push(s); continue; }
      converted++;
      console.log(`  ${s._id}  "${s.date} ${s.time}" → ${when.toISOString()}`);
      if (apply) {
        await Session.updateOne({ _id: s._id }, { $set: { scheduledAt: when, timezone: tz } });
      }
    }

    console.log(`\n${apply ? "Updated" : "Would update"}: ${converted}`);
    if (unparseable.length) {
      console.log(`⚠️  Could not parse date/time for ${unparseable.length} session(s) — fix manually:`);
      unparseable.forEach((s) => console.log(`  ${s._id}  date=${JSON.stringify(s.date)} time=${JSON.stringify(s.time)}`));
    }

    // Report (not modify) stored links that fail the new rules; the API never serves them.
    const withLinks = await Session.find({ meetLink: { $ne: null } }).select("meetLink");
    const unsafe = withLinks.filter((s) => !isSafeMeetLink(s.meetLink));
    if (unsafe.length) {
      console.log(`\n⚠️  ${unsafe.length} stored meetLink(s) are not valid https URLs (hidden by the API):`);
      unsafe.forEach((s) => console.log(`  ${s._id}  ${JSON.stringify(s.meetLink).slice(0, 80)}`));
    }
    if (!apply && converted) console.log("\nRe-run with --apply to write these changes.");
  } catch (err) {
    console.error("Error:", err.message);
    process.exitCode = 1;
  } finally {
    try { await mongoose.disconnect(); } catch {}
  }
})();

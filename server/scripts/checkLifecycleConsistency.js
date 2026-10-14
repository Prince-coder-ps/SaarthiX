/*
 * Phase 1 helper — run ONCE before deploying the new Session index.
 *   node server/scripts/checkLifecycleConsistency.js
 *
 * 1. Reports data that violates the new lifecycle rules (read-only).
 * 2. If there are no duplicate active sessions, builds the partial unique index.
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
const MentorshipRequest = require("../models/MentorshipRequest");

(async () => {
  try {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing. Please check your .env file.");
    await mongoose.connect(process.env.MONGO_URI);

    // A) more than one scheduled session for the same request  (blocks the unique index)
    const dupes = await Session.aggregate([
      { $match: { status: "scheduled" } },
      { $group: { _id: "$requestId", count: { $sum: 1 }, ids: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } },
    ]);

    // B) scheduled session whose request is not "scheduled"
    const scheduledSessions = await Session.find({ status: "scheduled" }).select("requestId");
    const reqs = await MentorshipRequest.find({
      _id: { $in: scheduledSessions.map((s) => s.requestId) },
    }).select("status");
    const reqStatus = new Map(reqs.map((r) => [String(r._id), r.status]));
    const sessionRequestMismatch = scheduledSessions.filter((s) => reqStatus.get(String(s.requestId)) !== "scheduled");

    // C) request "scheduled" without a scheduled session
    const scheduledReqs = await MentorshipRequest.find({ status: "scheduled" }).select("_id");
    const withSession = new Set(scheduledSessions.map((s) => String(s.requestId)));
    const requestNoSession = scheduledReqs.filter((r) => !withSession.has(String(r._id)));

    console.log(`A) Requests with >1 scheduled session : ${dupes.length}`);
    dupes.forEach((d) => console.log(`   request ${d._id} → sessions ${d.ids.join(", ")}`));
    console.log(`B) Scheduled sessions, request not 'scheduled': ${sessionRequestMismatch.length}`);
    sessionRequestMismatch.forEach((s) => console.log(`   session ${s._id} (request ${s.requestId})`));
    console.log(`C) 'scheduled' requests with no scheduled session: ${requestNoSession.length}`);
    requestNoSession.forEach((r) => console.log(`   request ${r._id}`));

    if (dupes.length) {
      console.log("\n❌ Fix the duplicates in (A) first (cancel/delete the extra sessions), then re-run.");
      process.exitCode = 1;
    } else {
      await Session.createIndexes();
      console.log("\n✅ Index 'uniq_active_session_per_request' is in place.");
      if (sessionRequestMismatch.length || requestNoSession.length) {
        console.log("⚠️  (B)/(C) rows are legacy inconsistencies: review them manually.");
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exitCode = 1;
  } finally {
    try { await mongoose.disconnect(); } catch {}
  }
})();

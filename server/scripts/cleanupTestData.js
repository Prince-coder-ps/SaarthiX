/*
 * Removes DUMMY data created by the Postman collection and the automated test suite.
 *
 *   node scripts/cleanupTestData.js            # DRY RUN — only shows what would be deleted
 *   node scripts/cleanupTestData.js --apply    # actually deletes
 *
 * Only users whose email matches one of these patterns are touched:
 *   pm_student_<digits>@example.com / pm_alumni_<digits>@example.com / pm_other_<digits>@example.com   (Postman)
 *   test_qa_<anything>@example.com                                                                      (test suite)
 * Admin accounts are NEVER deleted. Real users (any other email) are never matched.
 *
 * For every matched user it also removes their mentorship requests, sessions, reminders,
 * notifications and posts (and the other participant's reminder notifications for those requests).
 */
const path = require("path");
const fs = require("fs");

const serverEnv = path.resolve(__dirname, "../.env");
const rootEnv = path.resolve(__dirname, "../../.env");
if (fs.existsSync(serverEnv)) require("dotenv").config({ path: serverEnv });
else if (fs.existsSync(rootEnv)) require("dotenv").config({ path: rootEnv });
else require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");
const MentorshipRequest = require("../models/MentorshipRequest");
const Session = require("../models/Session");
const SessionReminder = require("../models/SessionReminder");
const Notification = require("../models/Notification");
const Post = require("../models/Post");

const apply = process.argv.includes("--apply");
const TEST_EMAIL = /^(pm_(student|alumni|other)_\d+|test_qa_.+)@example\.com$/i;

(async () => {
  try {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is missing. Please check your .env file.");
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Database: ${mongoose.connection.name}`);
    console.log(`Mode    : ${apply ? "APPLY (deleting)" : "DRY RUN (nothing is deleted)"}\n`);

    // Pattern is applied in JS as well, so only exact matches are ever deleted.
    const candidates = await User.find({ email: { $regex: "@example\\.com$", $options: "i" } }).select("email role");
    const users = candidates.filter((u) => TEST_EMAIL.test(u.email));
    const admins = users.filter((u) => u.role === "admin");
    const targets = users.filter((u) => u.role !== "admin");

    if (admins.length) console.log(`Skipping ${admins.length} admin account(s): ${admins.map((a) => a.email).join(", ")}`);
    if (!targets.length) {
      console.log("No test users found. Nothing to clean.");
      return;
    }

    const userIds = targets.map((u) => u._id);
    const requests = await MentorshipRequest.find({ $or: [{ studentId: { $in: userIds } }, { alumniId: { $in: userIds } }] }).select("_id");
    const requestIds = requests.map((r) => r._id);
    const sessions = await Session.find({ requestId: { $in: requestIds } }).select("_id");
    const sessionIds = sessions.map((s) => s._id);

    const counts = {
      users: targets.length,
      requests: requestIds.length,
      sessions: sessionIds.length,
      reminders: await SessionReminder.countDocuments({ sessionId: { $in: sessionIds } }),
      notifications: await Notification.countDocuments({ $or: [{ userId: { $in: userIds } }, { relatedRequestId: { $in: requestIds } }] }),
      posts: await Post.countDocuments({ userId: { $in: userIds } }),
    };

    console.log("Test users found:");
    targets.slice(0, 25).forEach((u) => console.log(`  - ${u.email} (${u.role})`));
    if (targets.length > 25) console.log(`  … and ${targets.length - 25} more`);
    console.log("\nWould delete:", counts);

    if (!apply) {
      console.log("\nDry run only. Re-run with --apply to delete.");
      return;
    }

    await SessionReminder.deleteMany({ sessionId: { $in: sessionIds } });
    await Notification.deleteMany({ $or: [{ userId: { $in: userIds } }, { relatedRequestId: { $in: requestIds } }] });
    await Session.deleteMany({ requestId: { $in: requestIds } });
    await MentorshipRequest.deleteMany({ _id: { $in: requestIds } });
    await Post.deleteMany({ userId: { $in: userIds } });
    await User.deleteMany({ _id: { $in: userIds } });
    console.log("\n✅ Test data deleted.");
  } catch (err) {
    console.error("Error:", err.message);
    process.exitCode = 1;
  } finally {
    try { await mongoose.disconnect(); } catch {}
  }
})();

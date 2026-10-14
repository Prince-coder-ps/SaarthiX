const mongoose = require("mongoose");

/**
 * One record per (session, scheduledAt). It is the delivery state of the "30 minutes before"
 * reminder. Because scheduledAt is part of the unique key, rescheduling a session creates a
 * brand-new reminder and the old one can never fire again.
 */
const sessionReminderSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
    // The session time this reminder belongs to (UTC instant)
    scheduledAt: { type: Date, required: true },

    // Per-step delivery state — set right after each step succeeds
    studentNotifiedAt: { type: Date, default: null },
    alumniNotifiedAt: { type: Date, default: null },
    studentEmailSentAt: { type: Date, default: null },
    alumniEmailSentAt: { type: Date, default: null },

    completedAt: { type: Date, default: null },  // all four steps succeeded
    exhaustedAt: { type: Date, default: null },  // gave up after MAX_ATTEMPTS (see reminderService)

    // Concurrency control: only the caller that atomically sets lockedUntil may process
    lockedUntil: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true }
);

// The duplicate-prevention guarantee: one reminder per session time
sessionReminderSchema.index({ sessionId: 1, scheduledAt: 1 }, { unique: true });

module.exports = mongoose.model("SessionReminder", sessionReminderSchema);

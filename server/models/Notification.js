const mongoose = require("mongoose");

const NOTIFICATION_TYPES = ["SESSION_REMINDER"];

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    relatedRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "MentorshipRequest", default: null },
    relatedSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session", default: null },
    isRead: { type: Boolean, default: false },
    // Idempotency key (e.g. "session-reminder:<sessionId>:<scheduledAt ms>") so the same
    // notification can never be created twice for the same user, even under races.
    dedupeKey: { type: String, default: null, select: false },
  },
  { timestamps: true }
);

// List a user's recent notifications (newest first)
notificationSchema.index({ userId: 1, createdAt: -1 });
// Unread counts / unread-only queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
// DB-level duplicate guard (only for notifications that carry a dedupeKey)
notificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } }, name: "uniq_notification_dedupe" }
);

module.exports = mongoose.model("Notification", notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;

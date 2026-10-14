const mongoose = require("mongoose");
const { DEFAULT_TIMEZONE } = require("../utils/datetime");

const sessionSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentorshipRequest",
      required: [true, "Request ID is required"],
    },
    // Source of truth: a UTC instant. Phase 3 reminders compute `scheduledAt - 30 min` from this.
    scheduledAt: {
      type: Date,
      default: null, // null only for legacy rows created before Phase 2 (see migrateSessionScheduledAt.js)
    },
    // IANA zone the time was entered in (for display / future multi-zone support)
    timezone: {
      type: String,
      default: DEFAULT_TIMEZONE,
    },
    // LEGACY (pre-Phase 2): local strings with no zone. Not written for new sessions.
    date: { type: String, default: null },
    time: { type: String, default: null },
    notes: {
      type: String,
      maxlength: [500, "Notes cannot exceed 500 characters"],
      default: "",
    },
    status: {
      type: String,
      enum: ["scheduled", "completed", "cancelled"],
      default: "scheduled",
    },
    meetLink: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

sessionSchema.index({ requestId: 1 });

// Lets Phase 3 find "scheduled sessions starting soon" efficiently
sessionSchema.index({ status: 1, scheduledAt: 1 });

// DB-level guarantee: at most ONE *active* (scheduled) session per request.
// Cancelled/completed sessions are kept as history and don't block a new cycle.
// (Different key + explicit name so it can't conflict with the existing requestId_1 index.)
sessionSchema.index(
  { requestId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "scheduled" },
    name: "uniq_active_session_per_request",
  }
);

module.exports = mongoose.model("Session", sessionSchema);

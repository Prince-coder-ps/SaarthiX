const mongoose = require("mongoose");

const mentorshipRequestSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Student ID is required"],
    },
    alumniId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Alumni ID is required"],
    },
    message: {
      type: String,
      default: "I would love to connect for mentorship guidance.",
      maxlength: [500, "Message cannot exceed 500 characters"],
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "cancelled", "scheduled", "completed"],
      default: "pending",
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate requests from same student to same alumni
mentorshipRequestSchema.index(
  { studentId: 1, alumniId: 1 },
  { unique: true }
);

module.exports = mongoose.model("MentorshipRequest", mentorshipRequestSchema);

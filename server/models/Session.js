const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MentorshipRequest",
      required: [true, "Request ID is required"],
    },
    date: {
      type: String,
      required: [true, "Session date is required"],
    },
    time: {
      type: String,
      required: [true, "Session time is required"],
    },
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

module.exports = mongoose.model("Session", sessionSchema);

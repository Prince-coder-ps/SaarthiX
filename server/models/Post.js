const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, required: true, trim: true },
    role:     { type: String, enum: ["student", "alumni", "admin"], required: true },
    content:  { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

postSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Post", postSchema);

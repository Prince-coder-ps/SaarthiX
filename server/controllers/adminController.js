const mongoose = require("mongoose");
const User = require("../models/User");
const MentorshipRequest = require("../models/MentorshipRequest");
const Session = require("../models/Session");
const Post = require("../models/Post");
const Notification = require("../models/Notification");
const SessionReminder = require("../models/SessionReminder");

// ===== GET /api/admin/users ======= //

exports.getAllUsers = async (req, res, next) => {
  try {
    const { role, verified, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (typeof role === "string" && ["student", "alumni", "admin"].includes(role)) {
      filter.role = role;
    }
    if (verified !== undefined) {
      filter.isVerified = verified === "true";
    }

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
      users,
    });
  } catch (err) {
    next(err);
  }
};

// ===== GET /api/admin/stats ===== //

exports.getStats = async (req, res, next) => {
  try {
    const [totalUsers, verifiedAlumni, pendingVerifications, totalRequests, totalSessions] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: "alumni", isVerified: true }),
        User.countDocuments({ role: "alumni", isVerified: false }),
        MentorshipRequest.countDocuments(),
        Session.countDocuments(),
      ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        verifiedAlumni,
        pendingVerifications,
        totalRequests,
        totalSessions,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ====== PATCH /api/admin/verify/:userId ====== //

exports.verifyAlumni = async (req, res, next) => {
  try {
    const { verify } = req.body;

    if (typeof verify !== "boolean") {
      return res.status(400).json({ success: false, message: "`verify` must be a boolean." });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    if (user.role !== "alumni") {
      return res.status(400).json({ success: false, message: "Only alumni accounts can be verified." });
    }

    user.isVerified = verify;
    await user.save();

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// ====== DELETE /api/admin/users/:userId ====== //

exports.deleteUser = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID." });
    }

    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: "Admin cannot delete their own account." });
    }

    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    // Cascade: clean up their requests and associated sessions
    const userRequests = await MentorshipRequest.find({
      $or: [{ studentId: user._id }, { alumniId: user._id }],
    }).select("_id");

    const requestIds = userRequests.map((r) => r._id);
    const sessionIds = (await Session.find({ requestId: { $in: requestIds } }).select("_id")).map((s) => s._id);

    await Promise.all([
      SessionReminder.deleteMany({ sessionId: { $in: sessionIds } }),
      // their own notifications + the other participant's reminders that point at the deleted requests
      Notification.deleteMany({ $or: [{ userId: user._id }, { relatedRequestId: { $in: requestIds } }] }),
      Session.deleteMany({ requestId: { $in: requestIds } }),
      MentorshipRequest.deleteMany({ _id: { $in: requestIds } }),
      Post.deleteMany({ userId: user._id }),
    ]);

    res.json({ success: true, message: "User deleted." });
  } catch (err) {
    next(err);
  }
};

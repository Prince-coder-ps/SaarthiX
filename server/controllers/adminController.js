const User = require("../models/User");
const MentorshipRequest = require("../models/MentorshipRequest");
const Session = require("../models/Session");

// ─────────────────────────────────────────────────────────────
// GET /api/admin/users
// ─────────────────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const { role, verified } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (verified !== undefined) filter.isVerified = verified === "true";

    const users = await User.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/admin/stats
// ─────────────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
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
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/admin/verify/:userId
// ─────────────────────────────────────────────────────────────
exports.verifyAlumni = async (req, res) => {
  try {
    const { verify } = req.body;

    if (typeof verify !== "boolean") {
      return res.status(400).json({ success: false, message: "`verify` must be a boolean." });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { isVerified: verify },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    if (user.role !== "alumni") {
      return res.status(400).json({ success: false, message: "Only alumni accounts can be verified." });
    }

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/admin/users/:userId  (hard delete)
// ─────────────────────────────────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    // Cascade: clean up their requests
    await MentorshipRequest.deleteMany({
      $or: [{ studentId: user._id }, { alumniId: user._id }],
    });
    res.json({ success: true, message: "User deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

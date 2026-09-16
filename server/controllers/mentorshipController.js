const mongoose = require("mongoose");
const MentorshipRequest = require("../models/MentorshipRequest");
const User = require("../models/User");

// Cooldown period before a student can re-request an alumni who rejected them
const REJECTION_COOLDOWN_DAYS = 7;
const REJECTION_COOLDOWN_MS = REJECTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

// ===== POST /api/mentorship/request ===== //

exports.sendRequest = async (req, res) => {
  try {
    const { alumniId, message } = req.body;

    if (!alumniId) {
      return res.status(400).json({ success: false, message: "Alumni ID is required." });
    }
    if (!mongoose.Types.ObjectId.isValid(alumniId)) {
      return res.status(400).json({ success: false, message: "Invalid alumni ID." });
    }
    if (req.user.role !== "student") {
      return res.status(403).json({ success: false, message: "Only students can send mentorship requests." });
    }

    const alumni = await User.findById(alumniId);
    if (!alumni || alumni.role !== "alumni") {
      return res.status(404).json({ success: false, message: "Alumni not found." });
    }
    if (!alumni.isVerified) {
      return res.status(400).json({ success: false, message: "This alumni is not yet verified." });
    }

    const existing = await MentorshipRequest.findOne({
      studentId: req.user._id,
      alumniId,
    });

    const trimmedMessage = message?.trim() || "I would love to connect for mentorship guidance.";

    if (!existing) {
      // First-ever request to this alumni
      const request = await MentorshipRequest.create({
        studentId: req.user._id,
        alumniId,
        message: trimmedMessage,
      });
      return res.status(201).json({ success: true, request });
    }

    if (existing.status === "cancelled") {
      // Student cancelled it themselves earlier — allow immediate re-request
      existing.status = "pending";
      existing.message = trimmedMessage;
      existing.rejectedAt = null;
      existing.createdAt = new Date();
      await existing.save();
      return res.status(200).json({ success: true, request: existing });
    }

    if (existing.status === "rejected") {
      const rejectedAt = existing.rejectedAt || existing.updatedAt;
      const cooldownEndsAt = rejectedAt ? new Date(rejectedAt.getTime() + REJECTION_COOLDOWN_MS) : null;

      if (cooldownEndsAt && cooldownEndsAt > new Date()) {
        return res.status(409).json({
          success: false,
          message: `This alumni rejected your last request. You can send a new request after ${cooldownEndsAt.toDateString()}.`,
          cooldownEndsAt,
        });
      }

      // Cooldown passed (or no rejection timestamp on old data) — allow re-request
      existing.status = "pending";
      existing.message = trimmedMessage;
      existing.rejectedAt = null;
      existing.createdAt = new Date();
      await existing.save();
      return res.status(200).json({ success: true, request: existing });
    }

    // pending / accepted / scheduled / completed — block duplicate
    return res.status(409).json({
      success: false,
      message: "You have already sent a request to this alumni.",
    });
  } catch (err) {
    console.error("sendRequest error:", err);
    res.status(500).json({ success: false, message: "Failed to send request." });
  }
};

// ===== GET /api/mentorship/student ===== //
exports.getStudentRequests = async (req, res) => {
  try {
    const requests = await MentorshipRequest.find({ studentId: req.user._id })
      .populate("alumniId", "name domain company isVerified batch avatarUrl")
      .sort({ createdAt: -1 });

    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ====== GET /api/mentorship/alumni  (alumni sees incoming requests) ===== //

exports.getAlumniRequests = async (req, res) => {
  try {
    const requests = await MentorshipRequest.find({ alumniId: req.user._id })
      .populate("studentId", "name batch domain avatarUrl")
      .sort({ createdAt: -1 });

    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===== FETCH /api/mentorship/:id/status  (alumni or admin) ======= //

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["accepted", "rejected", "cancelled", "scheduled", "completed"];

    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${allowed.join(", ")}.` });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid request ID." });
    }

    const request = await MentorshipRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: "Mentorship request not found." });
    }

    if (status === "cancelled") {
      // Cancelling is a student-only action, and only on their own request
      const isOwnerStudent = request.studentId.toString() === req.user._id.toString();
      if (!isOwnerStudent) {
        return res.status(403).json({ success: false, message: "Not authorized to cancel this request." });
      }
      if (request.status !== "pending") {
        return res.status(409).json({
          success: false,
          message: `Only a pending request can be cancelled. This request is currently "${request.status}".`,
        });
      }
      request.status = "cancelled";
      await request.save();

      const populatedCancel = await request.populate([
        { path: "alumniId", select: "name domain company avatarUrl" },
        { path: "studentId", select: "name batch domain avatarUrl" },
      ]);
      return res.json({ success: true, request: populatedCancel });
    }

    // All other transitions (accepted / rejected / scheduled / completed) remain alumni/admin actions
    const isOwnerAlumni = request.alumniId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwnerAlumni && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized to update this request." });
    }

    request.status = status;
    if (status === "rejected") {
      request.rejectedAt = new Date();
    }
    await request.save();

    const populated = await request.populate([
      { path: "alumniId", select: "name domain company avatarUrl" },
      { path: "studentId", select: "name batch domain avatarUrl" },
    ]);

    res.json({ success: true, request: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===== GET /api/mentorship/alumni-list (browse verified alumni) ===== //

exports.getAlumniList = async (req, res) => {
  try {
    const { search, domain } = req.query;
    const filter = { role: "alumni", isVerified: true };

    if (search && search.trim()) {
      filter.$or = [
        { name:    { $regex: search.trim(), $options: "i" } },
        { domain:  { $regex: search.trim(), $options: "i" } },
        { company: { $regex: search.trim(), $options: "i" } },
      ];
    }
    if (domain && domain.trim()) {
      filter.domain = { $regex: domain.trim(), $options: "i" };
    }

    const alumni = await User.find(filter)
      .select("name batch domain company bio isVerified")
      .limit(24)
      .sort({ name: 1 });

    res.json({ success: true, alumni });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

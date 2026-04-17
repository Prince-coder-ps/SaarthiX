const MentorshipRequest = require("../models/MentorshipRequest");
const User = require("../models/User");

// ===== POST /api/mentorship/request ===== //

exports.sendRequest = async (req, res) => {
  try {
    const { alumniId, message } = req.body;

    if (!alumniId) {
      return res.status(400).json({ success: false, message: "Alumni ID is required." });
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
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "You have already sent a request to this alumni.",
      });
    }

    const request = await MentorshipRequest.create({
      studentId: req.user._id,
      alumniId,
      message: message?.trim() || "I would love to connect for mentorship guidance.",
    });

    res.status(201).json({ success: true, request });
  } catch (err) {
    console.error("sendRequest error:", err);
    res.status(500).json({ success: false, message: "Failed to send request." });
  }
};

// ===== GET /api/mentorship/student ===== //
exports.getStudentRequests = async (req, res) => {
  try {
    const requests = await MentorshipRequest.find({ studentId: req.user._id })
      .populate("alumniId", "name domain company isVerified batch")
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
      .populate("studentId", "name batch domain")
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
    const allowed = ["accepted", "rejected", "scheduled", "completed"];

    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${allowed.join(", ")}.` });
    }

    const request = await MentorshipRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: "Mentorship request not found." });
    }

    const isOwnerAlumni = request.alumniId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwnerAlumni && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized to update this request." });
    }

    request.status = status;
    await request.save();

    const populated = await request.populate([
      { path: "alumniId", select: "name domain company" },
      { path: "studentId", select: "name batch domain" },
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

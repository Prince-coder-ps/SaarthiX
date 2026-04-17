const Session = require("../models/Session");
const MentorshipRequest = require("../models/MentorshipRequest");

// ─────────────────────────────────────────────────────────────
// POST /api/sessions  (alumni creates a session for accepted request)
// ─────────────────────────────────────────────────────────────
exports.createSession = async (req, res) => {
  try {
    const { requestId, date, time, notes, meetLink } = req.body;

    if (!requestId || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "requestId, date, and time are required.",
      });
    }

    const request = await MentorshipRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: "Mentorship request not found." });
    }

    // Only the alumni for this request can schedule
    const isOwnerAlumni = request.alumniId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";
    if (!isOwnerAlumni && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized." });
    }

    if (request.status !== "accepted") {
      return res.status(400).json({
        success: false,
        message: "Request must be accepted before scheduling a session.",
      });
    }

    const session = await Session.create({ requestId, date, time, notes, meetLink });

    // Advance request status to scheduled
    request.status = "scheduled";
    await request.save();

    res.status(201).json({ success: true, session });
  } catch (err) {
    console.error("createSession error:", err);
    res.status(500).json({ success: false, message: "Failed to create session." });
  }
};

// ===== GET /api/sessions/:requestId ====== //

exports.getSessionByRequest = async (req, res) => {
  try {
    const session = await Session.findOne({ requestId: req.params.requestId }).populate({
      path: "requestId",
      populate: [
        { path: "studentId", select: "name email" },
        { path: "alumniId",  select: "name email" },
      ],
    });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ===== FETCH /api/sessions/:id/status  (mark complete or cancel) ====== //

exports.updateSessionStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["completed", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be: ${allowed.join(" or ")}.` });
    }

    const session = await Session.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    // If completed, advance request status too
    if (status === "completed") {
      await MentorshipRequest.findByIdAndUpdate(session.requestId, { status: "completed" });
    }

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

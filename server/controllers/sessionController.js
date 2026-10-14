const mongoose = require("mongoose");
const Session = require("../models/Session");
const MentorshipRequest = require("../models/MentorshipRequest");
const { SESSION_TRANSITIONS, canTransition, closeSession } = require("../utils/lifecycle");
const { resolveScheduledAt } = require("../utils/datetime");
const { validateMeetLink } = require("../utils/meetLink");
const { toSessionView } = require("../utils/sessionView");

// ─────────────────────────────────────────────────────────────
// POST /api/sessions  (alumni creates a session for accepted request)
// ─────────────────────────────────────────────────────────────
exports.createSession = async (req, res, next) => {
  try {
    const { requestId, date, time, scheduledAt, timeZone, notes, meetLink } = req.body;

    if (!requestId || (!scheduledAt && (!date || !time))) {
      return res.status(400).json({
        success: false,
        message: "requestId and a session date/time (date + time, or scheduledAt) are required.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid request ID." });
    }

    // Date/time → one UTC instant (the source of truth for reminders)
    const when = resolveScheduledAt({ scheduledAt, date, time, timeZone });
    if (!when.ok) {
      return res.status(400).json({ success: false, message: when.message });
    }

    // Meet link: backend validation is mandatory (https only; no javascript:/data:/file:)
    const link = validateMeetLink(meetLink);
    if (!link.ok) {
      return res.status(400).json({ success: false, message: link.message });
    }

    const request = await MentorshipRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: "Mentorship request not found." });
    }

    // Only the alumni for this request or admin can schedule
    const isOwnerAlumni = request.alumniId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";
    if (!isOwnerAlumni && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized." });
    }

    if (request.status === "scheduled") {
      return res.status(409).json({
        success: false,
        message: "A session has already been scheduled for this request.",
      });
    }
    if (request.status !== "accepted") {
      return res.status(400).json({
        success: false,
        message: "Request must be accepted before scheduling a session.",
      });
    }

    // Step 1 — create the session. The partial unique index (one "scheduled" session per
    // request) makes a concurrent duplicate fail here with E11000. Old cancelled/completed
    // sessions are history and do not conflict.
    let session;
    try {
      session = await Session.create({
        requestId,
        scheduledAt: when.scheduledAt,
        timezone: when.timezone,
        notes: typeof notes === "string" ? notes.trim().slice(0, 500) : "",
        meetLink: link.value,
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "A session has already been scheduled for this request.",
        });
      }
      throw err;
    }

    // Step 2 — advance request accepted → scheduled atomically (compare-and-set).
    const advanced = await MentorshipRequest.findOneAndUpdate(
      { _id: requestId, status: "accepted" },
      { $set: { status: "scheduled" } },
      { new: true }
    );

    if (!advanced) {
      // Request changed under us. This session never took effect, so remove the orphan
      // (it is not history) instead of leaving Request != scheduled with Session = scheduled.
      await Session.deleteOne({ _id: session._id, status: "scheduled" });
      return res.status(409).json({
        success: false,
        message: "Request is no longer in 'accepted' state. Session was not created.",
      });
    }

    res.status(201).json({ success: true, session: toSessionView(session) });
  } catch (err) {
    next(err);
  }
};

// ===== GET /api/sessions/:requestId ====== //

exports.getSessionByRequest = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.requestId)) {
      return res.status(400).json({ success: false, message: "Invalid request ID." });
    }

    // A request can have several historical sessions (cancelled cycles) — return the latest.
    const session = await Session.findOne({ requestId: req.params.requestId })
      .sort({ createdAt: -1 })
      .populate({
        path: "requestId",
        populate: [
          { path: "studentId", select: "name email" },
          { path: "alumniId",  select: "name email" },
        ],
      });

    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    // Authorization check: User must be student, alumni, or admin
    const request = session.requestId;
    const studentId = request?.studentId?._id ? request.studentId._id.toString() : request?.studentId?.toString();
    const alumniId = request?.alumniId?._id ? request.alumniId._id.toString() : request?.alumniId?.toString();
    const userId = req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (userId !== studentId && userId !== alumniId && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized to access this session." });
    }

    // Existing contract keeps `requestId` populated (participants' name/email);
    // scheduledAt / sanitised meetLink come from the shared view.
    res.json({ success: true, session: { ...toSessionView(session), requestId: session.requestId } });
  } catch (err) {
    next(err);
  }
};

// ===== PATCH /api/sessions/:id/status  (mark complete or cancel) ====== //

exports.updateSessionStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ["completed", "cancelled"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be: ${allowed.join(" or ")}.` });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid session ID." });
    }

    const session = await Session.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }

    const request = await MentorshipRequest.findById(session.requestId);
    const isOwnerAlumni = request && request.alumniId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwnerAlumni && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized to update this session." });
    }

    if (!canTransition(SESSION_TRANSITIONS, session.status, status)) {
      return res.status(409).json({
        success: false,
        message: `Session is already "${session.status}" and cannot be changed to "${status}".`,
      });
    }

    // Atomically moves Session AND its Request together (see utils/lifecycle.js)
    const result = await closeSession(session, status);
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    res.json({ success: true, session: toSessionView(result.session) });
  } catch (err) {
    next(err);
  }
};

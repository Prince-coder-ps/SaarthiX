const mongoose = require("mongoose");
const MentorshipRequest = require("../models/MentorshipRequest");
const User = require("../models/User");
const Session = require("../models/Session");
const { attachSessions } = require("../utils/sessionView");
const { REQUEST_TRANSITIONS, canTransition, closeSession } = require("../utils/lifecycle");

// Cooldown period before a student can re-request an alumni who rejected them
const REJECTION_COOLDOWN_DAYS = 7;
const REJECTION_COOLDOWN_MS = REJECTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");

// Start a NEW mentorship cycle on an existing request doc (cancelled/rejected → pending).
// Compare-and-set on the status we just read, so two parallel re-requests can't both win.
// Old Session documents are kept as history; they don't block the next cycle.
const reopenRequest = (existing, message) =>
  MentorshipRequest.findOneAndUpdate(
    { _id: existing._id, status: existing.status },
    { $set: { status: "pending", message, rejectedAt: null } },
    { new: true }
  );

const ALREADY_SENT = { success: false, message: "You have already sent a request to this alumni." };

// ===== POST /api/mentorship/request ===== //

exports.sendRequest = async (req, res, next) => {
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

    if (req.user._id.toString() === alumniId.toString()) {
      return res.status(400).json({ success: false, message: "You cannot request mentorship from yourself." });
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

    const trimmedMessage =
      typeof message === "string" && message.trim()
        ? message.trim().slice(0, 500)
        : "I would love to connect for mentorship guidance.";

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
      // Cancelled earlier (by the student, or because a session was cancelled) — allow immediate re-request
      const reopened = await reopenRequest(existing, trimmedMessage);
      if (!reopened) return res.status(409).json(ALREADY_SENT);
      return res.status(200).json({ success: true, request: reopened });
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
      const reopened = await reopenRequest(existing, trimmedMessage);
      if (!reopened) return res.status(409).json(ALREADY_SENT);
      return res.status(200).json({ success: true, request: reopened });
    }

    // pending / accepted / scheduled / completed — block duplicate
    return res.status(409).json(ALREADY_SENT);
  } catch (err) {
    next(err);
  }
};

// ===== GET /api/mentorship/student ===== //
exports.getStudentRequests = async (req, res, next) => {
  try {
    const requests = await MentorshipRequest.find({ studentId: req.user._id })
      .populate("alumniId", "name domain company isVerified batch avatarUrl")
      .sort({ createdAt: -1 });

    res.json({ success: true, requests: await attachSessions(requests) });
  } catch (err) {
    next(err);
  }
};

// ====== GET /api/mentorship/alumni  (alumni sees incoming requests) ===== //

exports.getAlumniRequests = async (req, res, next) => {
  try {
    const requests = await MentorshipRequest.find({ alumniId: req.user._id })
      .populate("studentId", "name batch domain avatarUrl")
      .sort({ createdAt: -1 });

    res.json({ success: true, requests: await attachSessions(requests) });
  } catch (err) {
    next(err);
  }
};

// ===== PATCH /api/mentorship/:id/status ======= //
// Role rules : student → cancel own pending request only
//              owner alumni / admin → accepted | rejected | completed
// Lifecycle  : enforced by REQUEST_TRANSITIONS (utils/lifecycle.js)
// "scheduled" can only be reached by creating a Session (POST /api/sessions), and
// "completed" is applied through the Session so both documents stay in sync.

const POPULATE_REQUEST = [
  { path: "alumniId", select: "name domain company avatarUrl" },
  { path: "studentId", select: "name batch domain avatarUrl" },
];

exports.updateStatus = async (req, res, next) => {
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

    // ── 1. WHO may ask for this status (ownership / role) ─────────────
    const isOwnerStudent = request.studentId.toString() === req.user._id.toString();
    const isOwnerAlumni = request.alumniId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (status === "cancelled") {
      // Cancelling is a student-only action, and only on their own request
      if (!isOwnerStudent) {
        return res.status(403).json({ success: false, message: "Not authorized to cancel this request." });
      }
    } else if (!isOwnerAlumni && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized to update this request." });
    }

    // ── 2. IS the transition legal from the current status ────────────
    if (!canTransition(REQUEST_TRANSITIONS, request.status, status)) {
      const message =
        status === "cancelled"
          ? `Only a pending request can be cancelled. This request is currently "${request.status}".`
          : `Invalid status transition: "${request.status}" → "${status}".`;
      return res.status(409).json({ success: false, message });
    }

    // ── 3. Apply ──────────────────────────────────────────────────────
    if (status === "scheduled") {
      return res.status(409).json({
        success: false,
        message: "A request becomes 'scheduled' only by creating a session (POST /api/sessions).",
      });
    }

    if (status === "completed") {
      // scheduled → completed goes through the active Session so both stay consistent
      const activeSession = await Session.findOne({ requestId: request._id, status: "scheduled" });
      if (!activeSession) {
        return res.status(409).json({
          success: false,
          message: "No scheduled session found for this request, so it cannot be completed.",
        });
      }
      const result = await closeSession(activeSession, "completed");
      if (!result.ok) {
        return res.status(result.status).json({ success: false, message: result.message });
      }
      const populatedDone = await result.request.populate(POPULATE_REQUEST);
      return res.json({ success: true, request: populatedDone });
    }

    // pending → accepted | rejected | cancelled  (atomic: only if still pending)
    const update = { status };
    if (status === "rejected") update.rejectedAt = new Date();

    const updated = await MentorshipRequest.findOneAndUpdate(
      { _id: request._id, status: "pending" },
      { $set: update },
      { new: true }
    );
    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "This request was changed by someone else. Please refresh and try again.",
      });
    }

    const populated = await updated.populate(POPULATE_REQUEST);
    res.json({ success: true, request: populated });
  } catch (err) {
    next(err);
  }
};

// ===== GET /api/mentorship/alumni-list (browse verified alumni) ===== //

exports.getAlumniList = async (req, res, next) => {
  try {
    const { search, domain } = req.query;
    const filter = { role: "alumni", isVerified: true };

    if (typeof search === "string" && search.trim()) {
      const escaped = escapeRegex(search.trim());
      filter.$or = [
        { name:    { $regex: escaped, $options: "i" } },
        { domain:  { $regex: escaped, $options: "i" } },
        { company: { $regex: escaped, $options: "i" } },
      ];
    }
    if (typeof domain === "string" && domain.trim()) {
      filter.domain = { $regex: escapeRegex(domain.trim()), $options: "i" };
    }

    const alumni = await User.find(filter)
      .select("name batch domain company bio isVerified")
      .limit(50)
      .sort({ name: 1 });

    res.json({ success: true, alumni });
  } catch (err) {
    next(err);
  }
};

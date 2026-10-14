/**
 * Mentorship lifecycle — single source of truth for allowed status transitions.
 *
 * Request:
 *   pending   → accepted | rejected   (owner alumni / admin)
 *   pending   → cancelled             (owner student)
 *   accepted  → scheduled             (ONLY by creating a Session)
 *   scheduled → completed | cancelled (ONLY through the Session, kept in sync)
 *   rejected  → pending               (new cycle via POST /mentorship/request, after cooldown)
 *   cancelled → pending               (new cycle via POST /mentorship/request)
 *   completed → (terminal)
 *
 * Session:
 *   scheduled → completed | cancelled (both terminal)
 *
 * Atomicity: we do NOT use MongoDB transactions (they need a replica set; a default
 * local mongod is standalone). Each write is an atomic compare-and-set on ONE document,
 * and the two-document operations are ordered + compensated so the collections never
 * stay out of sync.
 */
const MentorshipRequest = require("../models/MentorshipRequest");
const Session = require("../models/Session");

const REQUEST_TRANSITIONS = {
  pending: ["accepted", "rejected", "cancelled"],
  accepted: ["scheduled"],
  scheduled: ["completed", "cancelled"],
  rejected: ["pending"],
  cancelled: ["pending"],
  completed: [],
};

const SESSION_TRANSITIONS = {
  scheduled: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const canTransition = (table, from, to) =>
  Array.isArray(table[from]) && table[from].includes(to);

const fail = (status, message) => ({ ok: false, status, message });

/**
 * Close (complete or cancel) a scheduled session AND move its request to the same status.
 * Order: Session first (CAS scheduled → to), then Request (CAS scheduled → to).
 * If the request CAS fails (legacy/inconsistent data) the session change is rolled back,
 * so we never leave Request = completed with Session = scheduled.
 *
 * @returns {Promise<{ok:true, session, request} | {ok:false, status, message}>}
 */
const closeSession = async (session, to) => {
  if (!canTransition(SESSION_TRANSITIONS, session.status, to)) {
    return fail(409, `Session is already "${session.status}" and cannot be changed to "${to}".`);
  }

  // Atomic: only succeeds if the session is STILL scheduled (guards concurrent calls).
  const updatedSession = await Session.findOneAndUpdate(
    { _id: session._id, status: "scheduled" },
    { $set: { status: to } },
    { new: true }
  );
  if (!updatedSession) {
    const current = await Session.findById(session._id).select("status");
    return fail(409, `Session is already "${current ? current.status : "missing"}" and cannot be changed to "${to}".`);
  }

  const updatedRequest = await MentorshipRequest.findOneAndUpdate(
    { _id: session.requestId, status: "scheduled" },
    { $set: { status: to } },
    { new: true }
  );
  if (!updatedRequest) {
    // Compensate: put the session back so both documents stay consistent.
    try {
      await Session.updateOne({ _id: session._id, status: to }, { $set: { status: "scheduled" } });
    } catch (rollbackErr) {
      console.error("Lifecycle rollback failed for session", String(session._id), rollbackErr.message);
    }
    return fail(409, "The linked mentorship request is not in 'scheduled' state. No changes were made.");
  }

  return { ok: true, session: updatedSession, request: updatedRequest };
};

module.exports = {
  REQUEST_TRANSITIONS,
  SESSION_TRANSITIONS,
  canTransition,
  closeSession,
};

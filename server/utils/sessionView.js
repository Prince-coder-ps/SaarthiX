/**
 * Shapes Session documents for API responses and attaches them to request lists.
 *
 * Request ─ session ─ { id, scheduledAt, timezone, meetLink, notes, status }
 *
 * - Legacy sessions (date/time strings, no scheduledAt) get a derived scheduledAt on the fly.
 * - A stored meetLink that fails validation (old data, e.g. javascript:) is NEVER served.
 */
const Session = require("../models/Session");
const { DEFAULT_TIMEZONE, zonedToUtc } = require("./datetime");
const { isSafeMeetLink } = require("./meetLink");

const toSessionView = (session) => {
  if (!session) return null;
  const doc = typeof session.toObject === "function" ? session.toObject() : session;

  const timezone = doc.timezone || DEFAULT_TIMEZONE;
  let scheduledAt = doc.scheduledAt || null;
  if (!scheduledAt && doc.date && doc.time) {
    scheduledAt = zonedToUtc(doc.date, doc.time, timezone); // legacy row — null if unparseable
  }

  const view = {
    _id: doc._id,
    id: doc._id,
    requestId: doc.requestId,
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    timezone,
    meetLink: isSafeMeetLink(doc.meetLink) ? doc.meetLink : null,
    notes: doc.notes || "",
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
  // Keep legacy strings visible for old rows only, so the UI can still show something.
  if (!doc.scheduledAt && doc.date) view.date = doc.date;
  if (!doc.scheduledAt && doc.time) view.time = doc.time;
  return view;
};

/**
 * Attach `session` to each request (one batched query, no N+1).
 * scheduled request → its active scheduled session; completed → its completed session;
 * every other status → null.
 */
const attachSessions = async (requests) => {
  const docs = requests.map((r) => (typeof r.toObject === "function" ? r.toObject() : r));
  const ids = docs.filter((r) => ["scheduled", "completed"].includes(r.status)).map((r) => r._id);

  const byKey = new Map();
  if (ids.length) {
    const sessions = await Session.find({
      requestId: { $in: ids },
      status: { $in: ["scheduled", "completed"] },
    }).sort({ createdAt: -1 });
    for (const s of sessions) {
      const key = `${s.requestId}:${s.status}`;
      if (!byKey.has(key)) byKey.set(key, s); // newest first
    }
  }

  return docs.map((r) => {
    const s = ["scheduled", "completed"].includes(r.status) ? byKey.get(`${r._id}:${r.status}`) : null;
    const view = toSessionView(s);
    if (view) delete view.requestId; // already nested under its request
    return { ...r, session: view };
  });
};

module.exports = { toSessionView, attachSessions };

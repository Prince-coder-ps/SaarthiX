/**
 * Session reminder processor.
 *
 *   MongoDB ─▶ findDueSessions ─▶ claim(SessionReminder) ─▶ 4 independent steps
 *                                                       ├─ student notification
 *                                                       ├─ alumni notification
 *                                                       ├─ student email
 *                                                       └─ alumni email
 *
 * Source of truth is MongoDB (Session.scheduledAt, a UTC instant). Nothing is held in memory,
 * so server restarts / crashes / sleeping hosts only delay a reminder, never lose or repeat it.
 *
 * Eligibility:  status = "scheduled"  AND  now < scheduledAt <= now + 30 min
 *   - exactly 30 min away → eligible; > 30 min → not yet
 *   - scheduled < 30 min before start → eligible immediately (message states the real minutes left)
 *   - already started → no (a "starts in N minutes" reminder would be wrong)
 *   - cancelled / completed / deleted → never selected
 *
 * Duplicate prevention: SessionReminder has a UNIQUE (sessionId, scheduledAt). A processor must
 * atomically claim it (findOneAndUpdate on lockedUntil) before doing any work, and every step has
 * its own "done" timestamp. Notifications additionally have a unique dedupeKey.
 * Rescheduling changes scheduledAt → new key → fresh reminder; the old one can never fire.
 */
const Session = require("../models/Session");
const MentorshipRequest = require("../models/MentorshipRequest");
const Notification = require("../models/Notification");
const SessionReminder = require("../models/SessionReminder");
const emailService = require("./emailService");

const REMINDER_LEAD_MINUTES = 30;
const REMINDER_LEAD_MS = REMINDER_LEAD_MINUTES * 60 * 1000;
const LOCK_MS = 5 * 60 * 1000;      // crash safety: a dead processor's claim expires after this
const RETRY_DELAY_MS = 60 * 1000;   // wait before retrying a partially failed reminder
const MAX_ATTEMPTS = 5;             // then mark exhausted (stops endless retries)
const BATCH_LIMIT = 200;

const log = (msg) => console.log(`[Reminder] ${msg}`);
const warn = (msg) => console.warn(`[Reminder] ${msg}`);

// Never put credentials in logs/DB: keep only a short message.
const safeError = (err) => String((err && err.message) || err || "unknown error").slice(0, 200);

const minutesLeftFor = (scheduledAt, now) =>
  Math.min(REMINDER_LEAD_MINUTES, Math.max(1, Math.ceil((new Date(scheduledAt).getTime() - now.getTime()) / 60000)));

const dedupeKeyFor = (sessionId, scheduledAt) => `session-reminder:${sessionId}:${new Date(scheduledAt).getTime()}`;

/** Sessions whose reminder time has arrived (read-only query). */
const findDueSessions = (now, sessionIds) => {
  const filter = {
    status: "scheduled",
    scheduledAt: { $gt: now, $lte: new Date(now.getTime() + REMINDER_LEAD_MS) },
  };
  if (Array.isArray(sessionIds)) filter._id = { $in: sessionIds };
  return Session.find(filter).sort({ scheduledAt: 1 }).limit(BATCH_LIMIT);
};

/**
 * Atomically claim the reminder for (session, scheduledAt).
 * Returns the reminder doc if THIS caller won the claim, otherwise null.
 */
const claimReminder = async (session, now) => {
  const key = { sessionId: session._id, scheduledAt: session.scheduledAt };
  try {
    // Idempotent create; concurrent creators collide on the unique index — which is fine.
    await SessionReminder.updateOne(key, { $setOnInsert: { attempts: 0 } }, { upsert: true });
  } catch (err) {
    if (!(err && err.code === 11000)) throw err;
  }
  return SessionReminder.findOneAndUpdate(
    {
      ...key,
      completedAt: null,
      exhaustedAt: null,
      $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
    },
    { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 } },
    { new: true }
  );
};

const releaseLock = (reminderId, extra = {}) =>
  SessionReminder.updateOne({ _id: reminderId }, { $set: { lockedUntil: null, ...extra } });

/** Creates the in-app notification once (unique dedupeKey makes a repeat a no-op). */
const createReminderNotification = async ({ user, otherName, request, session, minutesLeft }) => {
  try {
    await Notification.create({
      userId: user._id,
      type: "SESSION_REMINDER",
      title: "Mentorship Session Reminder",
      message: `Your mentorship session with ${otherName} starts in ${minutesLeft === 1 ? "1 minute" : `${minutesLeft} minutes`}.`,
      relatedRequestId: request._id,
      relatedSessionId: session._id,
      dedupeKey: dedupeKeyFor(session._id, session.scheduledAt),
    });
  } catch (err) {
    if (err && err.code === 11000) return; // already created by an earlier attempt
    throw err;
  }
};

/**
 * Process ONE claimed reminder. Each of the four steps is independent: a failure in one never
 * stops the others, and finished steps are never repeated on retry.
 */
const processClaimed = async (reminder, session, { now, emailSender }) => {
  const sid = String(session._id);
  log(`Processing session ${sid}`);

  const request = await MentorshipRequest.findById(session.requestId)
    .populate("studentId", "name email")
    .populate("alumniId", "name email");

  if (!request || !request.studentId || !request.alumniId) {
    warn(`Session ${sid}: request or participant missing`);
    const giveUp = reminder.attempts >= MAX_ATTEMPTS;
    await SessionReminder.updateOne(
      { _id: reminder._id },
      { $set: { lastError: "request or participant missing", lockedUntil: new Date(now.getTime() + RETRY_DELAY_MS), ...(giveUp ? { exhaustedAt: new Date(), lockedUntil: null } : {}) } }
    );
    return { sessionId: sid, status: giveUp ? "exhausted" : "failed" };
  }

  // The session may have been cancelled / rescheduled between selection and now.
  const stillValid = await Session.exists({ _id: session._id, status: "scheduled", scheduledAt: session.scheduledAt });
  if (!stillValid) {
    log(`Session ${sid}: changed before sending — skipped`);
    await releaseLock(reminder._id);
    return { sessionId: sid, status: "skipped" };
  }

  const student = request.studentId;
  const alumni = request.alumniId;
  const minutesLeft = minutesLeftFor(session.scheduledAt, now);
  const mailBase = { scheduledAt: session.scheduledAt, timezone: session.timezone, meetLink: session.meetLink, minutesLeft };

  const steps = [
    {
      label: "Student notification", field: "studentNotifiedAt",
      run: () => createReminderNotification({ user: student, otherName: alumni.name, request, session, minutesLeft }),
    },
    {
      label: "Alumni notification", field: "alumniNotifiedAt",
      run: () => createReminderNotification({ user: alumni, otherName: student.name, request, session, minutesLeft }),
    },
    {
      label: "Student email", field: "studentEmailSentAt",
      run: () => emailSender({ to: student.email, recipientName: student.name, otherName: alumni.name, role: "student", ...mailBase }),
    },
    {
      label: "Alumni email", field: "alumniEmailSentAt",
      run: () => emailSender({ to: alumni.email, recipientName: alumni.name, otherName: student.name, role: "alumni", ...mailBase }),
    },
  ];

  const done = {};
  let lastError = null;
  for (const step of steps) {
    if (reminder[step.field]) { done[step.field] = true; continue; } // finished in an earlier attempt
    try {
      await step.run();
      await SessionReminder.updateOne({ _id: reminder._id }, { $set: { [step.field]: new Date() } });
      done[step.field] = true;
      log(`${step.label} ${step.label.includes("email") ? "sent" : "created"} (session ${sid})`);
    } catch (err) {
      lastError = `${step.label}: ${safeError(err)}`;
      warn(`Failed to ${step.label.includes("email") ? "send" : "create"} ${step.label.toLowerCase()} (session ${sid}): ${safeError(err)}`);
    }
  }

  if (steps.every((s) => done[s.field])) {
    await SessionReminder.updateOne({ _id: reminder._id }, { $set: { completedAt: new Date(), lockedUntil: null, lastError: null } });
    log(`Reminder completed (session ${sid})`);
    return { sessionId: sid, status: "completed" };
  }

  if (reminder.attempts >= MAX_ATTEMPTS) {
    await SessionReminder.updateOne({ _id: reminder._id }, { $set: { exhaustedAt: new Date(), lockedUntil: null, lastError } });
    warn(`Reminder exhausted after ${reminder.attempts} attempts (session ${sid})`);
    return { sessionId: sid, status: "exhausted" };
  }

  // Partial failure: retry only the missing steps after a short delay
  await SessionReminder.updateOne(
    { _id: reminder._id },
    { $set: { lockedUntil: new Date(now.getTime() + RETRY_DELAY_MS), lastError } }
  );
  warn(`Reminder incomplete — will retry missing steps (session ${sid}, attempt ${reminder.attempts}/${MAX_ATTEMPTS})`);
  return { sessionId: sid, status: "partial" };
};

/**
 * One scheduler tick. Safe to run concurrently / repeatedly.
 * @param {object}   [opts]
 * @param {Date}     [opts.now]         injectable clock (tests)
 * @param {Function} [opts.emailSender] injectable email provider (tests mock it; default = real service)
 * @param {Array}    [opts.sessionIds]  restrict to these sessions (tests)
 */
const runReminderTick = async ({ now = new Date(), emailSender = emailService.sendSessionReminderEmail, sessionIds } = {}) => {
  const summary = { due: 0, claimed: 0, completed: 0, partial: 0, exhausted: 0, skipped: 0, failed: 0 };
  let sessions;
  try {
    sessions = await findDueSessions(now, sessionIds);
  } catch (err) {
    warn(`Could not query due sessions: ${safeError(err)}`);
    return summary;
  }
  summary.due = sessions.length;

  for (const session of sessions) {
    try {
      const reminder = await claimReminder(session, now);
      if (!reminder) continue; // done already, locked by another run, or exhausted
      summary.claimed++;
      const result = await processClaimed(reminder, session, { now, emailSender });
      summary[result.status]++;
    } catch (err) {
      summary.failed++;
      warn(`Session ${session._id}: unexpected error: ${safeError(err)}`); // never crashes the tick
    }
  }
  return summary;
};

module.exports = {
  runReminderTick,
  findDueSessions,
  claimReminder,
  REMINDER_LEAD_MINUTES,
  REMINDER_LEAD_MS,
  MAX_ATTEMPTS,
  RETRY_DELAY_MS,
  LOCK_MS,
};

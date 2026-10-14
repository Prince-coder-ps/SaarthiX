# SaarthiX — phase log (keep this file updated; it is the "don't forget anything" reference)

## Phase 1 — lifecycle bugs  ✅ done
- server/utils/lifecycle.js (NEW): REQUEST_TRANSITIONS / SESSION_TRANSITIONS + closeSession() (atomic compare-and-set, rollback).
- server/models/Session.js: partial unique index `uniq_active_session_per_request` (one "scheduled" session per request).
- server/controllers/sessionController.js, mentorshipController.js: transition checks, atomic updates, clean 409 on duplicate scheduling.
- server/scripts/checkLifecycleConsistency.js (NEW): read-only consistency report + builds the index.
- server/tests/api.test.js: "Lifecycle (Phase 1)" block.

## Phase 2 — scheduled session on request cards  ✅ done
Backend
- Session.scheduledAt (Date, UTC) is the source of truth; Session.timezone (IANA, default Asia/Kolkata / env APP_TIMEZONE). date/time strings are LEGACY (optional, not written for new sessions).
- server/utils/datetime.js (NEW): zone-aware conversion via Intl (no dependency), past-time + ambiguity checks.
- server/utils/meetLink.js (NEW): https-only validation (rejects javascript:, data:, file:, http:, credentials, spaces, non-public hosts).
- server/utils/sessionView.js (NEW): session DTO + attachSessions(); legacy rows get a derived scheduledAt; unsafe stored links are never served.
- GET /api/mentorship/student and /alumni now return request.session = { id, _id, scheduledAt, timezone, meetLink, notes, status } (null unless scheduled/completed).
- POST /api/sessions accepts { requestId, date, time, timeZone? } OR { requestId, scheduledAt (ISO with offset) }, plus meetLink/notes.
- Index { status:1, scheduledAt:1 } added for Phase 3 queries.
- server/scripts/migrateSessionScheduledAt.js (NEW): backfill for old sessions (dry-run by default, --apply to write).
Frontend
- client/src/components/SessionInfo.jsx (NEW) + client/src/utils/sessionView.js (NEW): "Scheduled · 5 October 2026 • 5:00 PM" + [Join Meet].
- StudentDashboard.jsx / AlumniDashboard.jsx: card info, modal shows Join only for scheduled sessions, schedule form sends timeZone + pattern=https.
Tests
- server/tests/api.test.js: "Session info (Phase 2)" block; FUTURE_DATE replaces hard-coded dates.
- client/tests/sessionView.test.js (NEW): `cd client && npm test`.

## Phase 3 — session reminders + in-app notifications  ✅ done
Backend
- models/SessionReminder.js (NEW): one record per (sessionId, scheduledAt), UNIQUE → duplicate prevention + rescheduling support. Per-step flags (studentNotifiedAt, alumniNotifiedAt, studentEmailSentAt, alumniEmailSentAt), lockedUntil, attempts.
- models/Notification.js (NEW): userId, type (SESSION_REMINDER), title, message, relatedRequestId, relatedSessionId, isRead, timestamps, hidden dedupeKey (partial unique index). Indexes: {userId,createdAt}, {userId,isRead,createdAt}.
- services/emailService.js (NEW): Nodemailer/SMTP, escaped HTML + text templates, offline transport in tests, never logs credentials.
- services/reminderService.js (NEW): runReminderTick() — due = status scheduled AND now < scheduledAt <= now+30min; atomic claim; 4 independent steps; retry 60s, max 5 attempts.
- services/reminderScheduler.js (NEW): setInterval 60s on the SERVER + immediate catch-up tick at boot. (ENABLE_REMINDER_SCHEDULER=false disables.)
- controllers/notificationController.js + routes/notificationRoutes.js (NEW): GET /api/notifications, PATCH /api/notifications/:id/read, PATCH /api/notifications/read-all (always scoped to req.user._id).
- routes/internalRoutes.js (NEW): POST /api/internal/reminders/run (header x-cron-secret = CRON_SECRET; 404 when CRON_SECRET unset) for hosts that sleep.
- app.js, server.js: mount routes / start scheduler.  package.json: + nodemailer.  server/.env.example (NEW).
Frontend
- components/NotificationBell.jsx (NEW), utils/notificationView.js (NEW), services/api.js (+notificationAPI), Navbar.jsx (bell: desktop + mobile).
Tests
- server/tests/api.test.js: "Notifications + Session reminders (Phase 3)" block (45 checks, email provider always mocked).
- client/tests/notificationView.test.js (NEW).
Before Phase 3 reminders work for OLD sessions: run  node server/scripts/migrateSessionScheduledAt.js --apply

## Release prep (deployment readiness)  ✅ done
- README.md rewritten to match the real app; docs/ARCHITECTURE.md added (diagrams, data model, lifecycles, reminder pipeline).
- app.js: `trust proxy` in production (rate limiter now sees real client IPs behind Render/Railway); health message branded SaarthiX.
- server.js: refuses to start without JWT_SECRET; warns when CLIENT_ORIGIN is missing in production.
- scripts/createAdmin.js: credentials from ADMIN_EMAIL / ADMIN_PASSWORD; no default password in production.
- adminController.deleteUser: also deletes the user's notifications and reminders (Phase 3 data) — covered by a new test.
- client: .env.example, vercel.json + public/_redirects (SPA refresh on deep links); removed unused utils/helpers.js; "AlumniConnect" text → "SaarthiX".
- .gitignore tightened (.env.*, !.env.example); root scripts: start, test, test:client; engines node >= 18.

## Commands
- Consistency check + index:  node server/scripts/checkLifecycleConsistency.js
- Backfill (dry run / apply): node server/scripts/migrateSessionScheduledAt.js [--apply] [--tz Asia/Kolkata]
- Server tests (needs MongoDB in MONGO_URI; use a dev DB): cd server && npm test
- Client tests: cd client && npm test

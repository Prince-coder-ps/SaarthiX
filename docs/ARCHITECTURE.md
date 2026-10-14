# SaarthiX — Architecture

This document describes how SaarthiX is built and how data flows through it. Everything here reflects the code in this repository. Diagrams use [Mermaid](https://mermaid.js.org/) (rendered automatically on GitHub).

**Contents**
1. [System overview](#1-system-overview)
2. [Backend structure](#2-backend-structure)
3. [Data model](#3-data-model)
4. [Mentorship request & session lifecycle](#4-mentorship-request--session-lifecycle)
5. [Scheduling a session (end to end)](#5-scheduling-a-session-end-to-end)
6. [Reminder pipeline](#6-reminder-pipeline)
7. [Authentication & authorization](#7-authentication--authorization)
8. [Frontend architecture](#8-frontend-architecture)
9. [Time handling](#9-time-handling)
10. [Security controls](#10-security-controls)
11. [Deployment architecture](#11-deployment-architecture)
12. [Design decisions](#12-design-decisions)

---

## 1. System overview

```mermaid
flowchart LR
    subgraph Browser
      SPA["React SPA<br/>(Vite build, static files)"]
    end

    subgraph Backend["Express API (Node.js)"]
      API["REST routes → controllers"]
      SCH["Reminder scheduler<br/>(every 60 s, in-process)"]
      REM["reminderService"]
      MAIL["emailService<br/>(Nodemailer)"]
    end

    DB[("MongoDB / Atlas")]
    SMTP["SMTP provider<br/>(Brevo / Gmail …)"]
    CRON["External cron<br/>(optional)"]

    SPA -- "HTTPS JSON + Bearer JWT" --> API
    API <--> DB
    SCH --> REM
    CRON -- "POST /api/internal/reminders/run<br/>x-cron-secret" --> API
    API --> REM
    REM <--> DB
    REM --> MAIL --> SMTP
```

- The **frontend** is a static single-page app. It only talks to the API over HTTPS.
- The **backend** is one Express process. It serves the REST API **and** runs the reminder scheduler.
- **MongoDB is the single source of truth.** Nothing about reminders or sessions is kept only in memory, so restarts lose nothing.
- Email goes out through plain SMTP; the provider can be swapped by changing environment variables.

---

## 2. Backend structure

Request path: **route → middleware → controller → model**. Logic that isn't a request handler lives in `services/` and `utils/`.

```mermaid
flowchart TB
    R["routes/*"] --> M["middleware/authMiddleware<br/>protect · authorize"] --> C["controllers/*<br/>business rules"]
    C --> MOD["models/* (Mongoose)"]
    C --> U["utils/*<br/>lifecycle · datetime · meetLink · sessionView"]
    SV["services/*<br/>reminderService · emailService · reminderScheduler"] --> MOD
    SV --> U
```

| Path | Responsibility |
|---|---|
| `server.js` | Entry point: checks `JWT_SECRET`, connects to MongoDB, starts HTTP server, starts the reminder scheduler |
| `app.js` | Helmet, CORS, rate limit (auth only), JSON parsing, route mounting, 404 + global error handler |
| `middleware/authMiddleware.js` | `protect` verifies the JWT and loads the user; `authorize(...roles)` checks the role |
| `controllers/authController.js` | Register (student/alumni only), login, current user, profile update (whitelisted fields) |
| `controllers/mentorshipController.js` | Alumni directory, send/re-send request (cooldown), request lists (with their session attached), status changes |
| `controllers/sessionController.js` | Schedule session, read session, complete/cancel session |
| `controllers/notificationController.js` | List / mark read / mark all read — always scoped to `req.user` |
| `controllers/adminController.js` | Users list, stats, verify alumni, delete user with cascade |
| `controllers/postController.js` | Community feed |
| `utils/lifecycle.js` | The state-transition tables and `closeSession()` (atomic, keeps request and session in sync) |
| `utils/datetime.js` | Converts "date + time + time zone" to a UTC instant (built-in `Intl`, no extra library) |
| `utils/meetLink.js` | Accepts only valid `https://` links |
| `utils/sessionView.js` | Shapes sessions for API responses and attaches them to request lists in one query |
| `services/emailService.js` | SMTP transport + email templates (HTML escaped); offline transport in tests |
| `services/reminderService.js` | Finds due sessions, claims the reminder, performs the four delivery steps, retries |
| `services/reminderScheduler.js` | `setInterval` (60 s) that calls the reminder service, plus a catch-up run at boot |
| `routes/internalRoutes.js` | Optional HTTP trigger for the reminder pass (secret header, off by default) |

---

## 3. Data model

```mermaid
erDiagram
    USER ||--o{ MENTORSHIP_REQUEST : "student sends"
    USER ||--o{ MENTORSHIP_REQUEST : "alumni receives"
    MENTORSHIP_REQUEST ||--o{ SESSION : "has (history kept)"
    SESSION ||--o{ SESSION_REMINDER : "one per scheduledAt"
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ POST : writes

    USER {
      string name
      string email UK
      string password "bcrypt, hidden"
      enum role "student|alumni|admin"
      bool isVerified "alumni only"
      string batch
      string domain
      string company
      string bio
    }
    MENTORSHIP_REQUEST {
      ObjectId studentId
      ObjectId alumniId
      string message
      enum status "pending|accepted|rejected|cancelled|scheduled|completed"
      date rejectedAt
    }
    SESSION {
      ObjectId requestId
      date scheduledAt "UTC instant, source of truth"
      string timezone "IANA, e.g. Asia/Kolkata"
      string meetLink "https only, optional"
      string notes
      enum status "scheduled|completed|cancelled"
    }
    SESSION_REMINDER {
      ObjectId sessionId
      date scheduledAt
      date studentNotifiedAt
      date alumniNotifiedAt
      date studentEmailSentAt
      date alumniEmailSentAt
      date completedAt
      date exhaustedAt
      date lockedUntil
      int attempts
    }
    NOTIFICATION {
      ObjectId userId
      enum type "SESSION_REMINDER"
      string title
      string message
      ObjectId relatedRequestId
      ObjectId relatedSessionId
      bool isRead
    }
    POST {
      ObjectId userId
      string userName
      string role
      string content
    }
```

**Constraints that carry business rules**

| Collection | Index / constraint | Purpose |
|---|---|---|
| `users` | unique `email` | One account per email |
| `mentorshiprequests` | unique `(studentId, alumniId)` | One request document per pair (re-requests reuse it) |
| `sessions` | partial unique `(requestId, status)` where `status = "scheduled"` | **At most one active session per request**; cancelled/completed sessions stay as history |
| `sessions` | `(status, scheduledAt)` | Fast "what is due soon" query for reminders |
| `sessionreminders` | unique `(sessionId, scheduledAt)` | **One reminder per session time** — the duplicate guard; a new time means a new reminder |
| `notifications` | `(userId, createdAt)`, `(userId, isRead, createdAt)` | Listing and unread counts |
| `notifications` | partial unique `(userId, dedupeKey)` | Database-level backstop against duplicate reminder notifications |

---

## 4. Mentorship request & session lifecycle

The server owns the state machine (`server/utils/lifecycle.js`). The UI only hides buttons — it is never the security boundary.

```mermaid
stateDiagram-v2
    [*] --> pending: student sends request
    pending --> accepted: alumni accepts
    pending --> rejected: alumni rejects
    pending --> cancelled: student cancels
    accepted --> scheduled: alumni creates a session
    scheduled --> completed: Mark Done (session completed)
    scheduled --> cancelled: session cancelled
    rejected --> pending: new request after 7 days
    cancelled --> pending: new request (new cycle)
    completed --> [*]
```

Session: `scheduled → completed` or `scheduled → cancelled`. Both end states are final.

| Transition | Triggered by | Endpoint |
|---|---|---|
| → `pending` | Student | `POST /mentorship/request` (cooldown applies after a rejection) |
| `pending →` `accepted` / `rejected` | Owner alumni, admin | `PATCH /mentorship/:id/status` |
| `pending →` `cancelled` | Owning student | `PATCH /mentorship/:id/status` |
| `accepted → scheduled` | Owner alumni, admin — **only by creating a session** | `POST /sessions` |
| `scheduled → completed` | Owner alumni, admin | `PATCH /mentorship/:id/status` (the "Mark Done" button) or `PATCH /sessions/:id/status` |
| `scheduled → cancelled` | Owner alumni, admin | `PATCH /sessions/:id/status` |

Anything else is rejected with **409**; the wrong person gets **403**.

**Keeping request and session consistent (no transactions).** MongoDB transactions need a replica set, which a default local `mongod` isn't. Instead:

1. Every change is a **compare-and-set** (`findOneAndUpdate` filtered on the expected current status), so two simultaneous calls can't both succeed.
2. **Scheduling:** create the session first (the partial unique index blocks a second active one → clean `409`), then move the request `accepted → scheduled`. If that second step fails, the just-created session is deleted again.
3. **Completing / cancelling:** `closeSession()` updates the session, then the request. If the request update fails (inconsistent legacy data) the session change is rolled back.

**Re-request after a cancelled session.** The same request document is reopened (`cancelled → pending`). The old cancelled session stays as history and does not block the new one, because the unique index only covers sessions that are `scheduled`.

---

## 5. Scheduling a session (end to end)

```mermaid
sequenceDiagram
    actor A as Alumni
    participant UI as React (AlumniDashboard)
    participant API as Express /api/sessions
    participant DB as MongoDB

    A->>UI: date, time, notes, Meet link
    UI->>API: POST /sessions {requestId, date, time, timeZone, notes, meetLink}
    API->>API: validate: future time → UTC scheduledAt, https link, owner or admin
    API->>DB: insert Session (unique: one scheduled session per request)
    alt another active session exists
        DB-->>API: duplicate key
        API-->>UI: 409 "already scheduled"
    else ok
        API->>DB: request accepted → scheduled (compare-and-set)
        API-->>UI: 201 + session
        UI->>UI: refetch ["alumni-requests"] and ["session"]
    end
    Note over UI: Student's dashboard shows the card on its next fetch
```

What the dashboards get back: `GET /mentorship/student` and `GET /mentorship/alumni` attach a `session` object (`id, scheduledAt, timezone, meetLink, notes, status`) to each request that is `scheduled` or `completed`, using **one batched query** (no N+1). The card shows date/time and **Join Meet** only when the request **and** its session are `scheduled` and the link is a safe `https://` URL. Old rows with an unsafe stored link never receive it.

---

## 6. Reminder pipeline

```mermaid
flowchart TD
    T["Tick: every 60 s<br/>or POST /api/internal/reminders/run"] --> Q["Find due sessions<br/>status = scheduled<br/>now &lt; scheduledAt ≤ now + 30 min"]
    Q --> C{"Claim SessionReminder<br/>(sessionId, scheduledAt)<br/>atomic lock"}
    C -- "already completed,<br/>locked or exhausted" --> SKIP["skip"]
    C -- "won the claim" --> V{"Session still scheduled<br/>and same time?"}
    V -- no --> REL["release lock, skip"]
    V -- yes --> S1["Student notification"]
    V -- yes --> S2["Alumni notification"]
    V -- yes --> S3["Student email"]
    V -- yes --> S4["Alumni email"]
    S1 & S2 & S3 & S4 --> ALL{"all four done?"}
    ALL -- yes --> DONE["completedAt set"]
    ALL -- no --> RET["retry missing steps after 60 s<br/>max 5 attempts, then exhausted"]
```

**Rules**

| Situation | Behaviour |
|---|---|
| Exactly 30 min before | Eligible (`scheduledAt ≤ now + 30 min`) |
| More than 30 min before | Not yet eligible |
| Scheduled less than 30 min before start | Eligible immediately; message says the real minutes left |
| Already started | No reminder |
| Cancelled / completed / deleted | Never selected; also re-checked just before sending |
| Rescheduled (`scheduledAt` changed) | New key `(sessionId, scheduledAt)` → a fresh reminder; the old one can never fire |
| Server restart / sleep | The next tick (and a catch-up tick at boot) picks up whatever is due |

**How duplicates are prevented**

1. The `SessionReminder` record is created idempotently; its **unique `(sessionId, scheduledAt)`** key means there is only ever one per session time.
2. A processor must **claim** it with one atomic `findOneAndUpdate` (sets `lockedUntil`, increments `attempts`). Concurrent ticks or server instances lose the claim and skip.
3. Each of the four steps has its own timestamp, written right after that step succeeds. A retry only repeats missing steps — nobody gets a second email because the other person's email failed.
4. Notifications also carry a unique `dedupeKey`, so even a lost flag cannot create a second notification.
5. A crashed processor's lock expires after 5 minutes so another run can finish the job.

Email is *at least once*: a crash exactly between "SMTP accepted" and "flag saved" could resend one email. That window is tiny and cannot be removed with any SMTP setup.

**Failure handling.** A missing or invalid email address, or an SMTP error, fails only that step. Errors are logged without credentials (`[Reminder] …`) and a short error text is stored on the record.

**Notifications in the UI.** `NotificationBell` loads `GET /notifications` with React Query (`["notifications"]`), refetches once a minute and on window focus, shows the unread badge, marks items read on click and opens the user's dashboard. There are no browser timers involved in sending reminders.

---

## 7. Authentication & authorization

```mermaid
sequenceDiagram
    participant UI as React
    participant API as Express
    participant DB as MongoDB
    UI->>API: POST /auth/login {email, password}
    API->>DB: find user (+password hash)
    API-->>UI: {token (JWT, 7 d), user}
    UI->>UI: store token + user in localStorage
    UI->>API: any request + "Authorization: Bearer token"
    API->>API: protect: verify JWT, load user → req.user
    API->>API: authorize / ownership checks in the controller
    Note over UI,API: A 401 response makes the Axios interceptor clear storage and return to "/"
```

| Role | Can |
|---|---|
| `student` | Browse alumni, send/cancel own requests, read own sessions, feed, profile, own notifications |
| `alumni` | Accept/reject requests addressed to them, schedule/complete/cancel their sessions, feed, profile, own notifications. Must be **verified** to be requestable |
| `admin` | Verify alumni, delete users, view stats; may act on any session/request where the code allows admin |

Ownership is always checked **on the server** (e.g. a student can only cancel their own pending request; a user can only mark their own notification as read — someone else's returns `404`).

---

## 8. Frontend architecture

```mermaid
flowchart TB
    MAIN["main.jsx"] --> APP["App.jsx<br/>QueryClientProvider · BrowserRouter · AuthProvider"]
    APP --> ROUTES{"Routes"}
    ROUTES -- "public" --> IDX["/ Index (landing, sign in/up)"]
    ROUTES -- "any signed-in user" --> FEED["/feed"] & PROF["/profile"]
    ROUTES -- "student" --> SD["/student-dashboard"]
    ROUTES -- "alumni" --> AD["/alumni-dashboard"]
    ROUTES -- "admin" --> ADM["/admin"]
```

- **Navbar:** each page renders `<Navbar />` itself; it contains the `NotificationBell` (desktop and mobile) and the sign-in / sign-up dialogs. Toasts come from `sonner`.
- **Route guards:** `PublicRoute` sends signed-in users to `/feed`; `ProtectedRoute` sends signed-out users to `/` and redirects a wrong role to its own dashboard. These guards are convenience — the API enforces access.
- **State:** `AuthContext` holds the user and token. Server data lives in **React Query**: `["student-requests"]`, `["alumni-requests"]`, `["alumni-list", search, domain]`, `["session", requestId]`, `["notifications"]`, `["admin-users"]`, `["admin-stats"]`. Defaults: 1-minute stale time, one retry.
- **API layer:** `services/api.js` has one Axios instance (adds the Bearer token, handles 401) and grouped helpers: `authAPI`, `mentorshipAPI`, `sessionAPI`, `notificationAPI`, `adminAPI`, `postsAPI`.
- **Shared UI pieces:** `SessionInfo` (scheduled date/time + Join Meet; used by both dashboards), `StatusBadge`, `NotificationBell`, `Loader`.
- **Pure logic, unit-tested:** `utils/sessionView.js` (when to show the Meet button, date/time formatting) and `utils/notificationView.js` (badge text, "x min ago", click target) have no imports and are covered by `node:test` in `client/tests`.

---

## 9. Time handling

- A session time is stored as **one UTC instant** (`Session.scheduledAt`, a MongoDB `Date`). Reminder timing, sorting and "is it in the future" all use it. Separate date/time strings are no longer written (old rows keep them, and the API derives `scheduledAt` for them).
- The scheduling form sends `date`, `time` and the browser's IANA `timeZone`. The server converts them to UTC with `Intl`; the default zone (when none is sent) is `APP_TIMEZONE` = `Asia/Kolkata`. Nothing depends on the server's own time zone, and other zones work without code changes.
- A `scheduledAt` without an offset is rejected as ambiguous; times in the past are rejected.
- **Display:** the web app shows times in the viewer's local zone; emails show the time in the session's stored zone (IST for India).

---

## 10. Security controls

| Area | Control |
|---|---|
| Passwords | bcrypt (12 rounds); `select: false`, never returned |
| Auth | JWT (default 7 days); `protect` on every private route |
| Authorization | `authorize` for roles + ownership checks in controllers |
| Input | Type checks on every body field (blocks NoSQL operator injection), escaped regex search, field whitelists, 10 KB body limit |
| Transport / headers | Helmet; CORS restricted to `CLIENT_ORIGIN` in production |
| Abuse | Rate limit on `/api/auth/*` (20 / 15 min / IP); `trust proxy` enabled in production so the real client IP is used |
| Links / XSS | Meet links must be `https://` (validated on the server, re-checked in the UI); email HTML is escaped |
| Notifications | Queries always include the signed-in user's id; foreign ids return 404 |
| Cron endpoint | Constant-time secret comparison; returns 404 unless `CRON_SECRET` is set |
| Secrets | Only in environment variables; `.env` files git-ignored; logs never include credentials |

---

## 11. Deployment architecture

```mermaid
flowchart LR
    U["Users' browsers"] --> FE["Vercel / Netlify<br/>static React build<br/>VITE_API_URL=…/api"]
    FE -- "HTTPS (CORS: CLIENT_ORIGIN)" --> BE["Render / Railway<br/>Express + scheduler<br/>npm start"]
    BE --> ATLAS[("MongoDB Atlas")]
    BE --> SMTP["SMTP provider"]
    PING["External cron / uptime pinger<br/>(only if the host sleeps)"] -- "POST /api/internal/reminders/run" --> BE
```

- The frontend and backend are deployed separately. `VITE_API_URL` is baked into the frontend at build time; `CLIENT_ORIGIN` must match the frontend URL exactly.
- The scheduler lives inside the backend process. Hosts that put idle servers to sleep can't run a timer while asleep — use the external trigger (every minute). With several backend instances, everything is still safe: the database claim makes sure each reminder is processed once.
- Step-by-step instructions are in the [README](../README.md#deployment).

---

## 12. Design decisions

| Decision | Why |
|---|---|
| Plain `setInterval` + MongoDB as the source of truth, instead of per-session timeouts or a queue | Simplest design that survives restarts, crashes and multiple instances; no extra infrastructure for a portfolio-scale app |
| A separate `SessionReminder` collection (not a flag on `Session`) | Keyed by `(session, time)`: rescheduling re-arms it, per-step delivery state, history, and a unique index as the duplicate guard |
| Compare-and-set updates instead of MongoDB transactions | Works on standalone and Atlas alike; each step is atomic on a single document, with ordered writes and rollback for the two-document cases |
| Partial unique index on active sessions | Allows cancelled/completed history while guaranteeing a single active session per request, even under double clicks |
| Reuse the request document for a new mentorship cycle | Smallest change that keeps the existing UI/API; history lives in `Session` documents |
| `scheduledAt` as a UTC `Date` + IANA zone | Reliable arithmetic (`scheduledAt − 30 min`), correct display for any zone |
| Polling for notifications (no WebSockets) | Enough for a once-a-minute reminder feature; far less moving parts |
| State machine on the server, UI only mirrors it | The browser can never be the security boundary |

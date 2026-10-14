# SaarthiX — Alumni–Student Mentorship Platform

SaarthiX connects students with **verified alumni** for guided career mentorship. A student sends a request, the alumni accepts it and schedules a session with a Meet link, and both people get an in-app notification and an email **30 minutes before the session starts**.

Built with the **MERN** stack (MongoDB, Express, React, Node.js).

> Docs: [Architecture](docs/ARCHITECTURE.md) · [Phase / change log](docs/PHASE_LOG.md)

---

## Table of contents

1. [Features](#features)
2. [How the app works (workflow)](#how-the-app-works-workflow)
3. [Tech stack](#tech-stack)
4. [Project structure](#project-structure)
5. [Run it locally](#run-it-locally)
6. [Environment variables](#environment-variables)
7. [API reference](#api-reference)
8. [Session reminders & email](#session-reminders--email)
9. [Deployment](#deployment)
10. [Testing](#testing)
11. [Security](#security)
12. [Known limitations](#known-limitations)

---

## Features

### Student
- Browse **verified** alumni and search by name, domain or company.
- Send a mentorship request with a short message (max 500 characters).
- Track every request with a live status badge: *pending → accepted → scheduled → completed* (or rejected / cancelled).
- Cancel a request while it is still **pending**.
- After a rejection, a **7-day cooldown** applies before re-requesting the same alumni (the API tells you when you can ask again).
- See the scheduled **date, time and a Join Meet button** right on the request card, plus a session-details dialog.

### Alumni
- Sign up (the account stays **unverified** until an admin verifies it).
- Accept or reject incoming requests.
- Schedule a session for an accepted request: date, time, optional notes, optional **https** meeting link.
- See *Upcoming Sessions* (with Join Meet), *Mark Done* when a session is over, and *Completed Sessions*.

### Admin
- Dashboard stats: total users, verified alumni, pending alumni, requests, sessions.
- **Alumni verification queue** — verify or revoke.
- User list (the API supports role / verified filters and pagination) and **delete user** (also removes their requests, sessions, posts, reminders and notifications).

### Everyone (signed in)
- **Community feed** — post short updates (max 2000 characters) and read the latest posts.
- **Profile** — edit name, batch, domain, company and bio.
- **Notification bell** with an unread count, a dropdown of recent notifications, "mark all read".

---

## How the app works (workflow)

```
Student ──request──▶ pending ──accept──▶ accepted ──schedule──▶ scheduled ──done──▶ completed
                        │ reject                                     │ cancel
                        ▼                                            ▼
                    rejected ──(7 days)──▶ new request          cancelled ──▶ new request
                        ▲ cancel (by student)
```

1. **Sign up / sign in.** Roles are `student` or `alumni` (admin accounts are created with a script). Alumni cannot be requested until an admin verifies them.
2. **Request.** A student picks a verified alumni and sends a request → status `pending`.
3. **Decision.** The alumni **accepts** (`accepted`) or **rejects** (`rejected`). A student can **cancel** while `pending`.
4. **Schedule.** For an accepted request the alumni enters date, time, notes and an optional Meet link. The server stores the time as a UTC instant (`scheduledAt`), creates the session and moves the request to `scheduled`.
5. **Join.** Both people see the date/time and a **Join Meet** button on the request card.
6. **Reminder.** 30 minutes before `scheduledAt` the server creates an in-app notification and sends an email to **both** participants — exactly once per session.
7. **Finish.** After the session the alumni clicks **Mark Done** → session and request become `completed`. If the alumni cancels the session instead, both become `cancelled` and the student may send a fresh request; the old session is kept as history.

**Rules enforced on the server** (never only in the UI):

| Rule | Behaviour |
|---|---|
| Who can request | Only students, only to **verified** alumni, not to themselves |
| Duplicate requests | One request document per student–alumni pair; re-requests reuse it |
| Rejection cooldown | 7 days before the same student can ask the same alumni again |
| Valid status changes | Fixed state machine (see [Architecture](docs/ARCHITECTURE.md#4-mentorship-request--session-lifecycle)); illegal changes return **409** |
| Who may change what | Student → cancel own pending request. Owner alumni / admin → accept, reject, complete. Only the session creates `scheduled` |
| One active session | At most one `scheduled` session per request (database unique index) |
| Meet link | Optional, but must be a valid **https** URL (no `javascript:`, `data:`, `file:`, credentials in URL) |
| Session time | Must be in the future; stored as a UTC `Date` |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router, TanStack React Query, Axios, Tailwind CSS, lucide-react, sonner (toasts) |
| Backend | Node.js (≥ 18), Express 4, Mongoose 8, JSON Web Tokens, bcryptjs, Helmet, CORS, express-rate-limit, Nodemailer |
| Database | MongoDB (local or Atlas) |
| Tests | Custom HTTP integration runner (`server/tests/api.test.js`), Node's built-in `node:test` for client logic |

---

## Project structure

```
SaarthiX/
├── README.md
├── package.json                  # root scripts (dev, start, build, test, install:all)
├── docs/
│   ├── ARCHITECTURE.md           # diagrams, data model, lifecycles, reminder pipeline
│   └── PHASE_LOG.md              # change log of the lifecycle / session / reminder phases
│
├── server/                       # Express API
│   ├── server.js                 # entry: env checks → DB → listen → start reminder scheduler
│   ├── app.js                    # middleware (helmet, cors, rate limit), route mounting, error handler
│   ├── .env.example              # copy to .env
│   ├── config/db.js              # MongoDB connection
│   ├── middleware/authMiddleware.js   # protect (JWT) + authorize (roles)
│   ├── routes/                   # URL → controller wiring
│   │   ├── authRoutes.js · mentorshipRoutes.js · sessionRoutes.js
│   │   ├── notificationRoutes.js · postRoutes.js · adminRoutes.js
│   │   └── internalRoutes.js     # cron trigger for reminders (needs CRON_SECRET)
│   ├── controllers/              # request handling + business rules
│   ├── models/                   # Mongoose schemas
│   │   ├── User · MentorshipRequest · Session · Post
│   │   └── Notification · SessionReminder
│   ├── services/                 # work that isn't a request handler
│   │   ├── emailService.js       # SMTP (Nodemailer) + email templates
│   │   ├── reminderService.js    # finds due sessions, claims, sends, retries
│   │   └── reminderScheduler.js  # 60-second server-side poller
│   ├── utils/                    # pure helpers
│   │   ├── lifecycle.js          # state-transition tables + atomic closeSession()
│   │   ├── datetime.js           # zone-aware date/time → UTC conversion
│   │   ├── meetLink.js           # https-only link validation
│   │   └── sessionView.js        # API shape for sessions (+ attaches them to requests)
│   ├── scripts/                  # one-off admin / migration scripts
│   │   ├── createAdmin.js
│   │   ├── checkLifecycleConsistency.js
│   │   └── migrateSessionScheduledAt.js
│   └── tests/api.test.js         # integration test suite
│
└── client/                       # React SPA (Vite)
    ├── index.html
    ├── .env.example              # VITE_API_URL
    ├── vercel.json · public/_redirects   # SPA fallback for Vercel / Netlify
    ├── src/
    │   ├── main.jsx · App.jsx    # providers, routes, React Query defaults
    │   ├── context/AuthContext.jsx        # user + token, signIn / signUp / signOut
    │   ├── services/api.js       # one Axios instance + API groups (auth, mentorship, sessions, …)
    │   ├── pages/                # Index, Feed, StudentDashboard, AlumniDashboard, AdminPanel, Profile
    │   ├── components/           # Navbar, NotificationBell, SessionInfo, StatusBadge,
    │   │                         # MentorshipStepper (landing page), ProtectedRoute, PublicRoute, Loader, Footer
    │   ├── utils/                # sessionView.js, notificationView.js (pure, unit-tested)
    │   └── styles/main.css
    └── tests/                    # node:test unit tests for the pure utils
```

---

## Run it locally

**Prerequisites:** Node.js **18+**, and MongoDB (local `mongod` or a free Atlas cluster).

```bash
# 1. Install everything (root + server + client)
npm run install:all

# 2. Configure the backend
cp server/.env.example server/.env        # then edit MONGO_URI and JWT_SECRET
# Generate a strong secret:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Configure the frontend
cp client/.env.example client/.env        # VITE_API_URL=http://localhost:5000/api

# 4. Create the first admin (local dev only uses a default if you don't pass a password)
cd server && ADMIN_EMAIL=admin@saarthix.com ADMIN_PASSWORD='ChangeMe-123' node scripts/createAdmin.js && cd ..

# 5. Start API (http://localhost:5000) and web app (http://localhost:5173) together
npm run dev
```

Health check: `GET http://localhost:5000/api/health`.

Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (nodemon) + web app, together |
| `npm start` | Production API (`node server/server.js`) |
| `npm run build` | Production build of the web app → `client/dist` |
| `npm test` | Server tests + client tests |

---

## Environment variables

### Server — `server/.env`

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | ✅ | MongoDB connection string (include the database name) |
| `JWT_SECRET` | ✅ | Long random string; the server refuses to start without it |
| `JWT_EXPIRES_IN` | | Token lifetime, default `7d` |
| `PORT` | | Default `5000` (hosts usually inject this) |
| `NODE_ENV` | | `development` / `production` |
| `CLIENT_ORIGIN` | ✅ in production | Your frontend URL for CORS, e.g. `https://saarthix.vercel.app` (no trailing slash) |
| `APP_TIMEZONE` | | IANA zone used when a session time is entered without one. Default `Asia/Kolkata` |
| `EMAIL_HOST` `EMAIL_PORT` `EMAIL_SECURE` `EMAIL_USER` `EMAIL_PASSWORD` `EMAIL_FROM` | for emails | SMTP settings for reminder emails (see below) |
| `ENABLE_REMINDER_SCHEDULER` | | `false` disables the built-in 60-second scheduler. Default on |
| `CRON_SECRET` | optional | Enables `POST /api/internal/reminders/run` for external schedulers |

`createAdmin.js` reads `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (the password is **required** in production).

### Client — `client/.env`

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL **including `/api`**, e.g. `https://your-api.onrender.com/api`. Read at **build** time |

---

## API reference

All endpoints are under `/api`. 🔒 = needs `Authorization: Bearer <token>`.

| Area | Method & path | Who | Purpose |
|---|---|---|---|
| Health | `GET /health` | public | Liveness check |
| Auth | `POST /auth/register` | public | Create `student` or `alumni` account |
| | `POST /auth/login` | public | Returns JWT + user |
| | `GET /auth/me` 🔒 | any | Current user |
| | `PUT /auth/profile` 🔒 | any | Update name, batch, domain, company, bio, avatar |
| Mentorship | `GET /mentorship/alumni-list?search=&domain=` 🔒 | any | Verified alumni (max 50) |
| | `POST /mentorship/request` 🔒 | student | Send / re-send a request |
| | `GET /mentorship/student` 🔒 | student | My requests (+ `session` when scheduled/completed) |
| | `GET /mentorship/alumni` 🔒 | alumni | Requests sent to me (+ `session`) |
| | `PATCH /mentorship/:id/status` 🔒 | see rules | `accepted` / `rejected` / `cancelled` / `completed` |
| Sessions | `POST /sessions` 🔒 | owner alumni, admin | Schedule a session for an accepted request |
| | `GET /sessions/:requestId` 🔒 | student, alumni of the request, admin | Latest session of a request |
| | `PATCH /sessions/:id/status` 🔒 | owner alumni, admin | `completed` or `cancelled` |
| Notifications | `GET /notifications?limit=&unread=` 🔒 | any (own only) | List + `unreadCount` |
| | `PATCH /notifications/:id/read` 🔒 | owner | Mark one read |
| | `PATCH /notifications/read-all` 🔒 | any (own only) | Mark all read |
| Feed | `GET /posts` · `POST /posts` 🔒 | any | Community feed |
| Admin | `GET /admin/users` · `GET /admin/stats` 🔒 | admin | Users (filter/paginate), dashboard stats |
| | `PATCH /admin/verify/:userId` 🔒 | admin | Verify / revoke an alumni |
| | `DELETE /admin/users/:userId` 🔒 | admin | Delete a user and their data |
| Internal | `POST /internal/reminders/run` | cron (`x-cron-secret`) | Run one reminder pass; `404` unless `CRON_SECRET` is set |

`POST /sessions` body: `{ requestId, date: "YYYY-MM-DD", time: "HH:mm", timeZone?, notes?, meetLink? }` — or `scheduledAt` as an ISO string **with an offset** (e.g. `2026-10-05T17:00:00+05:30`).

Errors use `{ success: false, message }`. Typical codes: `400` validation, `401` not signed in, `403` wrong role/owner, `404` not found, `409` invalid state change or duplicate.

---

## Session reminders & email

- A server-side scheduler checks MongoDB **every 60 seconds** (and once at startup to catch up after a restart). It looks for sessions with `status = scheduled` whose `scheduledAt` is within the next 30 minutes and which have not been reminded yet.
- For each one it creates **one notification per person** and sends **one email per person**. State is stored in the `SessionReminder` collection (unique per session + time), so restarts, crashes or several server instances never cause duplicates.
- A session scheduled less than 30 minutes before the start is reminded immediately (the text says the real minutes left). A session that already started, or was cancelled / completed / deleted, gets no reminder.
- If one email fails, the other person's email and both notifications are unaffected; the missing step is retried every minute, up to 5 attempts.
- Nothing runs in the browser. Closing the tab doesn't affect reminders.

### Setting up email (SMTP)

Any SMTP provider works. Two easy options:

| Provider | `EMAIL_HOST` | `EMAIL_PORT` | Notes |
|---|---|---|---|
| Brevo (free tier) | `smtp-relay.brevo.com` | `587` | Use the SMTP login/key from Brevo as `EMAIL_USER` / `EMAIL_PASSWORD`; verify your sender address. Check Brevo's current free limits. |
| Gmail | `smtp.gmail.com` | `587` | Turn on 2-step verification and create an **App Password** (not your normal password). |

`EMAIL_FROM` example: `SaarthiX <you@example.com>`. Without SMTP settings, development mode only **logs** the email; in production the email step fails (and is logged) but in-app notifications still work.

---

## Deployment

A typical free setup: **MongoDB Atlas** (database) + **Render or Railway** (API) + **Vercel or Netlify** (web app).

### 1. Database — MongoDB Atlas
1. Create a cluster, a database user, and copy the connection string (add the database name, e.g. `.../saarthix`).
2. *Network Access*: allow your host. On Render/Railway free plans outbound IPs change, so most people allow `0.0.0.0/0` and rely on the strong DB password.

### 2. Backend — Render (Railway is similar)
- **Root directory:** `server` · **Build:** `npm install` · **Start:** `npm start` · **Health check path:** `/api/health`
- **Environment:** `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, `CLIENT_ORIGIN` (set after step 3), `EMAIL_*`, `APP_TIMEZONE`, optionally `CRON_SECRET`.
- Deploy, then open `https://<your-api>/api/health`.

### 3. Frontend — Vercel (Netlify is similar)
- **Root directory:** `client` · **Build:** `npm run build` · **Output:** `dist`
- **Environment:** `VITE_API_URL=https://<your-api>/api` (must be set **before** building)
- Page refreshes on deep links work because `client/vercel.json` and `client/public/_redirects` rewrite everything to `index.html`.
- Go back to the backend and set `CLIENT_ORIGIN` to the exact frontend URL (no trailing slash), then redeploy the backend.

### 4. Create the admin account (once)
From your laptop, pointing at the production database:

```bash
cd server
NODE_ENV=production MONGO_URI="<atlas-uri>" ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="<strong-password>" node scripts/createAdmin.js
```

### 5. Reminders on a free plan that sleeps
Free web services can sleep when idle, and a sleeping server cannot run its timer. Set `CRON_SECRET` on the backend and make an external scheduler (e.g. cron-job.org, UptimeRobot) send this request **every minute**:

```
POST https://<your-api>/api/internal/reminders/run
Header: x-cron-secret: <CRON_SECRET>
```

It also keeps the server awake. On a paid / always-on plan the built-in scheduler is enough.

### 6. Existing data? Run these once
```bash
cd server
node scripts/checkLifecycleConsistency.js            # reports problems, builds the unique session index
node scripts/migrateSessionScheduledAt.js            # dry run
node scripts/migrateSessionScheduledAt.js --apply    # backfill scheduledAt for old sessions
```
New databases don't need this.

### 7. Smoke test after deploy
1. `/api/health` returns `success: true`.
2. Register a student and an alumni; verify the alumni in the Admin panel.
3. Student requests → alumni accepts → alumni schedules a session ~10 minutes ahead with a Meet link.
4. Both dashboards show the date/time and **Join Meet**.
5. Within a minute or two both people get the 🔔 notification (and the email, if SMTP is set).

---

## Testing

```bash
cd client && npm test      # unit tests for the pure UI logic (no database)
cd server && npm test      # integration suite — needs MongoDB in MONGO_URI
```

> ⚠️ The server suite creates and then deletes its own `test_qa_…@example.com` users, but it runs against the database in `MONGO_URI` — **use a development database, never production.**
> Emails are always mocked in tests; no real email is sent.

The suite covers auth, role/ownership checks, the request and session state machines, the re-request flow, the concurrent-scheduling guard, `scheduledAt` / Meet-link validation, notifications, and the reminder pipeline (eligibility, delivery, duplicates, rescheduling, failures).

---

## Security

- Passwords hashed with bcrypt (12 rounds) and never returned by the API.
- JWT auth on all private routes; role checks (`authorize`) and **ownership checks on the server**.
- Helmet headers, CORS limited to `CLIENT_ORIGIN`, JSON body limit (10 KB), rate limit on `/api/auth/*` (20 requests / 15 min / IP; proxy-aware in production).
- Input type checks (blocks NoSQL operator injection); escaped regex search; profile updates use a field whitelist (users can't set their own `role` or `isVerified`).
- Meet links accepted only as `https://` URLs; unsafe stored values are never served; email HTML is escaped.
- Notifications are always scoped to the signed-in user; the cron endpoint uses a constant-time secret check and is off unless configured.
- No secrets in the repo: real `.env` files are git-ignored, only `*.env.example` templates are committed.

---

## Known limitations

- The JWT is kept in `localStorage` (a common SPA trade-off); tokens cannot be revoked before they expire.
- No password reset or email verification yet.
- There is no "reschedule" action — cancel the session and schedule a new one (reminders already handle a changed `scheduledAt`).
- Clicking a notification opens the user's dashboard, not a specific card.
- The notification list refreshes about once a minute (polling); there are no live WebSocket updates.
- Email delivery is "at least once": in the rare case of a crash between SMTP accepting a message and the database recording it, one email could be sent twice.

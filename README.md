# 🎓 AlumniConnect — MERN Stack Mentorship Platform

A **production-ready** MERN stack mentorship platform that connects students with verified alumni for structured, workflow-driven career guidance.

> Migrated from Lovable AI (Supabase) → pure MERN (MongoDB + Express + React + Node.js) with JWT authentication.

---

## 📁 Project Structure

```
alumni-connect/
│
├── .env                        # Root environment variables
├── package.json                # Root: runs both client & server concurrently
│
├── server/                     # Node.js + Express backend
│   ├── config/db.js            # MongoDB connection
│   ├── models/
│   │   ├── User.js             # User schema (student / alumni / admin)
│   │   ├── MentorshipRequest.js
│   │   └── Session.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── mentorshipController.js
│   │   ├── sessionController.js
│   │   └── adminController.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── mentorshipRoutes.js
│   │   ├── sessionRoutes.js
│   │   └── adminRoutes.js
│   ├── middleware/authMiddleware.js   # JWT verify + RBAC
│   ├── scripts/createAdmin.js        # One-time admin seeder
│   ├── app.js                        # Express configuration
│   └── server.js                     # Entry point
│
└── client/                     # React + Vite + Tailwind frontend
    ├── public/
    │   ├── index.html          # Clean HTML, no Lovable tags
    │   └── hero-bg.jpg
    └── src/
        ├── components/
        │   ├── Navbar.jsx      # Auth modals (JWT-based)
        │   ├── Footer.jsx
        │   ├── StatusBadge.jsx
        │   ├── MentorshipStepper.jsx
        │   └── Loader.jsx
        ├── pages/
        │   ├── Index.jsx
        │   ├── StudentDashboard.jsx
        │   ├── AlumniDashboard.jsx
        │   ├── AdminPanel.jsx
        │   └── ProfilePage.jsx
        ├── context/AuthContext.jsx   # JWT auth (localStorage)
        ├── services/api.js           # Axios client
        ├── utils/helpers.js
        ├── styles/main.css
        ├── App.jsx
        └── main.jsx
```

---

## 🚀 Quick Start

### Prerequisites

| Tool    | Version  |
|---------|----------|
| Node.js | ≥ 18.x   |
| npm     | ≥ 9.x    |
| MongoDB | Local or Atlas |

---

### Step 1 — Clone / place project

```bash
# If downloaded as zip, unzip and enter folder
cd alumni-connect
```

### Step 2 — Configure environment

Edit the root `.env` file:

```env
PORT=5000
NODE_ENV=development

# MongoDB — local or Atlas
MONGO_URI=mongodb://localhost:27017/alumni_connect

# JWT — use a long random string (32+ chars)
JWT_SECRET=replace_this_with_a_very_long_random_secret_string
JWT_EXPIRES_IN=7d

# Client
VITE_API_URL=http://localhost:5000/api
```

Also create `client/.env`:
```env
VITE_API_URL=http://localhost:5000/api
```

---

### Step 3 — Install all dependencies

```bash
# Root
npm install

# Server
cd server && npm install && cd ..

# Client
cd client && npm install && cd ..
```

---

### Step 4 — Create the first Admin account (one time only)

```bash
node server/scripts/createAdmin.js
```

Output:
```
✅ Admin created successfully!
   Email    : admin@alumniconnect.com
   Password : Admin@1234
```

> ⚠️ **Change this password** after your first login.

---

### Step 5 — Start the development server

```bash
npm run dev
```

| Service  | URL                      |
|----------|--------------------------|
| Frontend | http://localhost:5173    |
| Backend  | http://localhost:5000    |
| API docs | http://localhost:5000/api/health |

---

## 🔑 API Reference

### Auth

| Method | Endpoint           | Auth | Description          |
|--------|--------------------|------|----------------------|
| POST   | /api/auth/register | —    | Create account       |
| POST   | /api/auth/login    | —    | Login, returns JWT   |
| GET    | /api/auth/me       | JWT  | Get current user     |
| PUT    | /api/auth/profile  | JWT  | Update profile       |

### Mentorship

| Method | Endpoint                        | Auth       | Description                |
|--------|---------------------------------|------------|----------------------------|
| GET    | /api/mentorship/alumni-list     | JWT        | Browse verified alumni     |
| POST   | /api/mentorship/request         | JWT Student| Send mentorship request    |
| GET    | /api/mentorship/student         | JWT Student| My sent requests           |
| GET    | /api/mentorship/alumni          | JWT Alumni | Incoming requests          |
| PATCH  | /api/mentorship/:id/status      | JWT Alumni | Accept / reject / complete |

### Sessions

| Method | Endpoint                  | Auth       | Description           |
|--------|---------------------------|------------|-----------------------|
| POST   | /api/sessions             | JWT Alumni | Schedule session      |
| GET    | /api/sessions/:requestId  | JWT        | Get session details   |
| PATCH  | /api/sessions/:id/status  | JWT Alumni | Mark complete/cancel  |

### Admin (role: admin only)

| Method | Endpoint                   | Description              |
|--------|----------------------------|--------------------------|
| GET    | /api/admin/users           | List all users           |
| GET    | /api/admin/stats           | Platform statistics      |
| PATCH  | /api/admin/verify/:userId  | Verify / revoke alumni   |
| DELETE | /api/admin/users/:userId   | Delete user              |

---

## 👥 User Roles & Flow

```
Student  →  Browse verified alumni
         →  Send mentorship request
         →  Wait for acceptance
         →  Attend scheduled session

Alumni   →  Receive requests
         →  Accept or decline
         →  Schedule session (date, time, meet link)
         →  Mark session as completed

Admin    →  Verify alumni accounts
         →  View all users + stats
         →  Delete users if needed
```

---

## 🔐 Security Features

- **bcrypt** password hashing (12 salt rounds)
- **JWT** authentication with configurable expiry
- **Helmet** HTTP security headers
- **CORS** whitelisting
- **Rate limiting** on auth routes (20 req / 15 min)
- **Role-based access control** on every protected route
- Passwords excluded from all query results (`select: false`)

---

## 🌐 Production Deployment

### Backend (e.g., Railway / Render)
1. Set environment variables in your platform dashboard
2. Set `NODE_ENV=production`
3. Set `MONGO_URI` to your MongoDB Atlas connection string
4. Start command: `node server/server.js`

### Frontend (e.g., Vercel / Netlify)
1. Set `VITE_API_URL=https://your-backend-domain.com/api`
2. Build command: `cd client && npm run build`
3. Output directory: `client/dist`

### Update CORS in `server/app.js`
```js
origin: "https://your-frontend-domain.com"
```

---

## 📝 What Was Removed

| Removed | Replaced with |
|---------|---------------|
| Supabase client | Axios + Express + MongoDB |
| Supabase Auth | JWT (jsonwebtoken + bcryptjs) |
| Lovable OAuth (Google) | Email/password register + login |
| Lovable branding & meta tags | Clean HTML |
| `src/integrations/supabase/` | `src/services/api.js` |
| `src/integrations/lovable/` | `src/context/AuthContext.jsx` |
| All mock/static data | Real MongoDB queries |
| `.tsx` files | `.jsx` (no TypeScript complexity on client) |

---

## 🛠️ Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React 18 + Vite + Tailwind CSS    |
| State     | React Query v5 + Context API      |
| HTTP      | Axios                             |
| Backend   | Node.js + Express 4               |
| Database  | MongoDB + Mongoose                |
| Auth      | JWT + bcryptjs                    |
| Security  | Helmet + CORS + express-rate-limit|
| Toasts    | Sonner                            |
| Icons     | Lucide React                      |

---

© 2026 AlumniConnect. Built with the MERN stack.

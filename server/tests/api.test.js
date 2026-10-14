/**
 * Comprehensive Backend Test Suite for SaarthiX
 * Tests all 18 phases: Auth, Mentorship, Sessions, Admin, Posts, Security, IDOR, Errors (+ lifecycle, session info, reminders)
 */

const path = require("path");
process.env.NODE_ENV = "test";
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const http = require("http");
const mongoose = require("mongoose");
const app = require("../app");
const User = require("../models/User");
const MentorshipRequest = require("../models/MentorshipRequest");
const Session = require("../models/Session");
const Post = require("../models/Post");
const Notification = require("../models/Notification");
const SessionReminder = require("../models/SessionReminder");
const reminderService = require("../services/reminderService");
const emailService = require("../services/emailService");

let server;
let baseUrl;

// Ephemeral test accounts
const TEST_TIMESTAMP = Date.now();
const testAdminEmail = `test_qa_admin_${TEST_TIMESTAMP}@example.com`;
const testStudentEmail = `test_qa_student_${TEST_TIMESTAMP}@example.com`;
const testStudent2Email = `test_qa_student2_${TEST_TIMESTAMP}@example.com`;
const testAlumniEmail = `test_qa_alumni_${TEST_TIMESTAMP}@example.com`;
const testPassword = "TestPassword@123";

let adminToken, studentToken, student2Token, alumniToken;
let adminUser, studentUser, student2User, alumniUser;
let createdRequestId, createdSessionId, createdPostId;

const testResults = [];
// Always a future date, so scheduling tests never expire (backend rejects past sessions)
const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const extraTestEmails = []; // users created by the lifecycle block (cleaned up at the end)

function recordResult(category, testName, passed, details = "") {
  testResults.push({ category, testName, passed, details });
  const mark = passed ? "  ✅ PASS" : "  ❌ FAIL";
  console.log(`${mark} [${category}] ${testName}${details ? ` - ${details}` : ""}`);
}

async function request(method, endpoint, body = null, token = null) {
  const url = `${baseUrl}${endpoint}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const options = {
    method,
    headers,
  };

  if (body !== null && method !== "GET" && method !== "HEAD") {
    options.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  const res = await fetch(url, options);
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function runTests() {
  console.log("\n========================================================");
  console.log("       STARTING BACKEND SYSTEMATIC TEST SUITE           ");
  console.log("========================================================\n");

  try {
    // Connect to DB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB for testing.");

    // Start server on random available port
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
    console.log(`Test server running at ${baseUrl}\n`);

    // ==========================================
    // 1. HEALTH & STARTUP
    // ==========================================
    {
      const res = await request("GET", "/api/health");
      recordResult("Startup", "GET /api/health returns 200 with running message",
        res.status === 200 && res.data.success === true);
    }

    {
      const res = await request("GET", "/api/nonexistent-route");
      recordResult("Startup", "404 handler returns 404 for unknown route",
        res.status === 404 && res.data.success === false);
    }

    // ==========================================
    // 2. AUTHENTICATION (Register & Login)
    // ==========================================
    {
      // Missing fields
      const res = await request("POST", "/api/auth/register", { name: "Test" });
      recordResult("Auth", "Register with missing fields returns 400",
        res.status === 400 && res.data.success === false);
    }

    {
      // Invalid email format
      const res = await request("POST", "/api/auth/register", {
        name: "Test User",
        email: "invalid-email",
        password: testPassword,
      });
      recordResult("Auth", "Register with invalid email format returns 400",
        res.status === 400 && res.data.success === false);
    }

    {
      // Short password (<6 chars)
      const res = await request("POST", "/api/auth/register", {
        name: "Test User",
        email: `valid_${TEST_TIMESTAMP}@test.com`,
        password: "123",
      });
      recordResult("Auth", "Register with password < 6 chars returns 400",
        res.status === 400 && res.data.success === false);
    }

    {
      // Register valid Student
      const res = await request("POST", "/api/auth/register", {
        name: "Test Student",
        email: testStudentEmail,
        password: testPassword,
        role: "student",
      });
      studentToken = res.data?.token;
      studentUser = res.data?.user;
      recordResult("Auth", "Register valid student returns 201 + token + safe user",
        res.status === 201 && !!studentToken && studentUser.role === "student" && !studentUser.password);
    }

    {
      // Register duplicate Student email
      const res = await request("POST", "/api/auth/register", {
        name: "Duplicate Student",
        email: testStudentEmail,
        password: testPassword,
        role: "student",
      });
      recordResult("Auth", "Register duplicate email returns 409 Conflict",
        res.status === 409 && res.data.success === false);
    }

    {
      // Register Student 2
      const res = await request("POST", "/api/auth/register", {
        name: "Test Student Two",
        email: testStudent2Email,
        password: testPassword,
        role: "student",
      });
      student2Token = res.data?.token;
      student2User = res.data?.user;
      recordResult("Auth", "Register second student returns 201",
        res.status === 201 && !!student2Token);
    }

    {
      // Register Alumni (should default to isVerified: false)
      const res = await request("POST", "/api/auth/register", {
        name: "Test Alumni",
        email: testAlumniEmail,
        password: testPassword,
        role: "alumni",
      });
      alumniToken = res.data?.token;
      alumniUser = res.data?.user;
      recordResult("Auth", "Register valid alumni returns 201 and isVerified=false",
        res.status === 201 && !!alumniToken && alumniUser.isVerified === false);
    }

    {
      // Create test Admin directly in DB (prevent public registration of admin)
      adminUser = await User.create({
        name: "Test Admin",
        email: testAdminEmail,
        password: testPassword,
        role: "admin",
      });
      // Login as Admin
      const res = await request("POST", "/api/auth/login", {
        email: testAdminEmail,
        password: testPassword,
      });
      adminToken = res.data?.token;
      recordResult("Auth", "Login with valid admin credentials returns 200 + token",
        res.status === 200 && !!adminToken);
    }

    {
      // Login with wrong password
      const res = await request("POST", "/api/auth/login", {
        email: testStudentEmail,
        password: "WrongPassword@123",
      });
      recordResult("Auth", "Login with incorrect password returns 401",
        res.status === 401 && res.data.success === false);
    }

    {
      // Login with non-existent email
      const res = await request("POST", "/api/auth/login", {
        email: "nonexistent_email_123456@example.com",
        password: testPassword,
      });
      recordResult("Auth", "Login with non-existent email returns 401",
        res.status === 401 && res.data.success === false);
    }

    {
      // Login with non-string input (type safety / NoSQL injection attempt)
      const res = await request("POST", "/api/auth/login", {
        email: { $gt: "" },
        password: testPassword,
      });
      recordResult("Security", "Login with object email (NoSQL injection attempt) returns 400",
        res.status === 400 && res.data.success === false);
    }

    // ==========================================
    // 3. GET / ME & PROFILE UPDATE
    // ==========================================
    {
      // Access /api/auth/me without token
      const res = await request("GET", "/api/auth/me");
      recordResult("Auth", "GET /api/auth/me without token returns 401",
        res.status === 401);
    }

    {
      // Access /api/auth/me with invalid token
      const res = await request("GET", "/api/auth/me", null, "invalid.bearer.token");
      recordResult("Auth", "GET /api/auth/me with malformed token returns 401",
        res.status === 401);
    }

    {
      // Access /api/auth/me with valid student token
      const res = await request("GET", "/api/auth/me", null, studentToken);
      recordResult("Auth", "GET /api/auth/me with valid token returns user data",
        res.status === 200 && res.data.user.email === testStudentEmail && !res.data.user.password);
    }

    {
      // Update profile
      const res = await request("PUT", "/api/auth/profile", {
        name: "Updated Student Name",
        bio: "Passionate CS student seeking career mentorship.",
        domain: "Software Engineering",
        batch: "2024",
      }, studentToken);
      recordResult("Profile", "PUT /api/auth/profile updates fields correctly",
        res.status === 200 && res.data.user.name === "Updated Student Name" && res.data.user.domain === "Software Engineering");
    }

    {
      // Update profile with empty name
      const res = await request("PUT", "/api/auth/profile", { name: "   " }, studentToken);
      recordResult("Profile", "PUT /api/auth/profile with empty name returns 400",
        res.status === 400 && res.data.success === false);
    }

    // ==========================================
    // 4. ADMIN APIS & ROLE-BASED ACCESS CONTROL
    // ==========================================
    {
      // Student tries to access admin stats
      const res = await request("GET", "/api/admin/stats", null, studentToken);
      recordResult("Authorization", "Student forbidden from GET /api/admin/stats (403)",
        res.status === 403 && res.data.success === false);
    }

    {
      // Admin accesses admin stats
      const res = await request("GET", "/api/admin/stats", null, adminToken);
      recordResult("Admin", "Admin GET /api/admin/stats returns 200 + stats object",
        res.status === 200 && typeof res.data.stats?.totalUsers === "number");
    }

    {
      // Admin lists users
      const res = await request("GET", "/api/admin/users", null, adminToken);
      recordResult("Admin", "Admin GET /api/admin/users returns 200 + user list",
        res.status === 200 && Array.isArray(res.data.users));
    }

    {
      // Admin verifies alumni with invalid boolean
      const res = await request("PATCH", `/api/admin/verify/${alumniUser.id}`, { verify: "yes" }, adminToken);
      recordResult("Validation", "Admin verify with non-boolean returns 400",
        res.status === 400 && res.data.success === false);
    }

    {
      // Admin tries to verify a STUDENT account (prevent data corruption)
      const res = await request("PATCH", `/api/admin/verify/${studentUser.id}`, { verify: true }, adminToken);
      const studentInDb = await User.findById(studentUser.id);
      recordResult("Admin", "Admin verify non-alumni returns 400 and does NOT corrupt student isVerified",
        res.status === 400 && studentInDb.isVerified === false);
    }

    {
      // Admin verifies legitimate Alumni account
      const res = await request("PATCH", `/api/admin/verify/${alumniUser.id}`, { verify: true }, adminToken);
      recordResult("Admin", "Admin verifies alumni account returns 200 and sets isVerified=true",
        res.status === 200 && res.data.user.isVerified === true);
    }

    {
      // Admin tries to delete their own account (self-deletion protection)
      const res = await request("DELETE", `/api/admin/users/${adminUser._id}`, null, adminToken);
      recordResult("Admin", "Admin self-deletion returns 400 Bad Request",
        res.status === 400 && res.data.success === false);
    }

    {
      // Admin delete with invalid ObjectId
      const res = await request("DELETE", "/api/admin/users/not-a-valid-id", null, adminToken);
      recordResult("Validation", "Admin delete invalid ObjectId returns 400",
        res.status === 400 && res.data.success === false);
    }

    // ==========================================
    // 5. MENTORSHIP REQUESTS & STATE TRANSITIONS
    // ==========================================
    {
      // Alumni browse list (verified alumni only)
      const res = await request("GET", "/api/mentorship/alumni-list", null, studentToken);
      recordResult("Mentorship", "GET /api/mentorship/alumni-list returns verified alumni",
        res.status === 200 && Array.isArray(res.data.alumni) && res.data.alumni.some((a) => a._id === alumniUser.id));
    }

    {
      // Security: Regex ReDoS test on alumni search
      const res = await request("GET", "/api/mentorship/alumni-list?search=test(unclosed-bracket", null, studentToken);
      recordResult("Security", "GET /api/mentorship/alumni-list safely handles regex special characters without crashing",
        res.status === 200 && Array.isArray(res.data.alumni));
    }

    {
      // Student requests self mentorship (should fail)
      const res = await request("POST", "/api/mentorship/request", { alumniId: studentUser.id }, studentToken);
      recordResult("Validation", "Student requesting mentorship from themselves returns 400",
        res.status === 400 && res.data.success === false);
    }

    {
      // Alumni attempts to send a mentorship request (students only)
      const res = await request("POST", "/api/mentorship/request", { alumniId: alumniUser.id }, alumniToken);
      recordResult("Authorization", "Alumni sending mentorship request returns 403",
        res.status === 403 && res.data.success === false);
    }

    {
      // Valid Student sends mentorship request to verified Alumni
      const res = await request("POST", "/api/mentorship/request", {
        alumniId: alumniUser.id,
        message: "Hello! Looking forward to mentorship guidance.",
      }, studentToken);
      createdRequestId = res.data?.request?._id;
      recordResult("Mentorship", "Student sends valid mentorship request returns 201 (pending)",
        res.status === 201 && res.data.request?.status === "pending");
    }

    {
      // Duplicate mentorship request (same student, same alumni)
      const res = await request("POST", "/api/mentorship/request", {
        alumniId: alumniUser.id,
      }, studentToken);
      recordResult("Mentorship", "Duplicate mentorship request returns 409 Conflict",
        res.status === 409 && res.data.success === false);
    }

    {
      // Student views sent requests
      const res = await request("GET", "/api/mentorship/student", null, studentToken);
      recordResult("Mentorship", "GET /api/mentorship/student returns student requests",
        res.status === 200 && res.data.requests.length > 0);
    }

    {
      // Alumni views incoming requests
      const res = await request("GET", "/api/mentorship/alumni", null, alumniToken);
      recordResult("Mentorship", "GET /api/mentorship/alumni returns incoming requests",
        res.status === 200 && res.data.requests.length > 0);
    }

    {
      // Student 2 tries to accept/reject Student 1's request (Unauthorized)
      const res = await request("PATCH", `/api/mentorship/${createdRequestId}/status`, {
        status: "accepted",
      }, student2Token);
      recordResult("Authorization", "Unauthorized user cannot update request status (403)",
        res.status === 403 && res.data.success === false);
    }

    {
      // Alumni accepts the mentorship request
      const res = await request("PATCH", `/api/mentorship/${createdRequestId}/status`, {
        status: "accepted",
      }, alumniToken);
      recordResult("Mentorship", "Assigned alumni accepts mentorship request (status=accepted)",
        res.status === 200 && res.data.request?.status === "accepted");
    }

    // ==========================================
    // 6. SESSIONS & IDOR PROTECTION
    // ==========================================
    {
      // Unauthorized user (Student 2) tries to create session
      const res = await request("POST", "/api/sessions", {
        requestId: createdRequestId,
        date: FUTURE_DATE,
        time: "15:00",
      }, student2Token);
      recordResult("Authorization", "Unauthorized user cannot schedule session (403)",
        res.status === 403 && res.data.success === false);
    }

    {
      // Alumni schedules session for accepted request
      const res = await request("POST", "/api/sessions", {
        requestId: createdRequestId,
        date: FUTURE_DATE,
        time: "15:00",
        notes: "Discuss career progression and system design.",
        meetLink: "https://meet.google.com/abc-defg-hij",
      }, alumniToken);
      createdSessionId = res.data?.session?._id;
      recordResult("Sessions", "Alumni schedules session returns 201 and advances request to 'scheduled'",
        res.status === 201 && res.data.session?.status === "scheduled");
    }

    {
      // Verify request status was advanced to scheduled in DB
      const reqDoc = await MentorshipRequest.findById(createdRequestId);
      recordResult("Sessions", "MentorshipRequest status synced to 'scheduled'",
        reqDoc && reqDoc.status === "scheduled");
    }

    {
      // IDOR TEST: Student 2 (an unrelated user) attempts to view Student 1 & Alumni's session
      const res = await request("GET", `/api/sessions/${createdRequestId}`, null, student2Token);
      recordResult("Security", "IDOR Protection: Unrelated user cannot view private session details (403)",
        res.status === 403 && res.data.success === false);
    }

    {
      // Legitimate Student 1 views the session
      const res = await request("GET", `/api/sessions/${createdRequestId}`, null, studentToken);
      recordResult("Sessions", "Owner student can view their scheduled session (200)",
        res.status === 200 && res.data.session?._id === createdSessionId);
    }

    {
      // IDOR / ACCESS CONTROL TEST: Student 2 tries to complete or cancel the session
      const res = await request("PATCH", `/api/sessions/${createdSessionId}/status`, {
        status: "completed",
      }, student2Token);
      recordResult("Security", "Access Control: Unrelated user cannot complete session (403)",
        res.status === 403 && res.data.success === false);
    }

    {
      // Alumni completes the session
      const res = await request("PATCH", `/api/sessions/${createdSessionId}/status`, {
        status: "completed",
      }, alumniToken);
      const reqDoc = await MentorshipRequest.findById(createdRequestId);
      recordResult("Sessions", "Alumni completes session and request status updates to 'completed'",
        res.status === 200 && res.data.session?.status === "completed" && reqDoc.status === "completed");
    }

    // ==========================================
    // 7. POSTS (COMMUNITY FEED)
    // ==========================================
    {
      // Create post with missing/non-string content
      const res = await request("POST", "/api/posts", { content: 12345 }, studentToken);
      recordResult("Validation", "POST /api/posts with non-string content returns 400",
        res.status === 400 && res.data.success === false);
    }

    {
      // Create post with valid content
      const res = await request("POST", "/api/posts", {
        content: "Excited to be part of the SaarthiX alumni network!",
      }, studentToken);
      createdPostId = res.data?.post?._id;
      recordResult("Posts", "POST /api/posts creates post returns 201",
        res.status === 201 && res.data.post?.userName === "Updated Student Name");
    }

    {
      // Fetch posts
      const res = await request("GET", "/api/posts", null, studentToken);
      recordResult("Posts", "GET /api/posts returns array of posts",
        res.status === 200 && Array.isArray(res.data.posts) && res.data.posts.length > 0);
    }

    // ==========================================
    // 8. ERROR HANDLING & JSON SYNTAX
    // ==========================================
    {
      // Send malformed JSON
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ malformed json: true ",
      });
      const data = await res.json();
      recordResult("ErrorHandling", "Malformed JSON syntax returns 400 Bad Request",
        res.status === 400 && data.success === false);
    }

    {
      // Invalid ObjectId format in URL param
      const res = await request("GET", "/api/sessions/invalid-object-id-string", null, studentToken);
      recordResult("ErrorHandling", "Invalid ObjectId in route parameter returns 400 (CastError handled)",
        res.status === 400 && res.data.success === false);
    }


    // ==========================================
    // 8. LIFECYCLE / STATE MACHINE (Phase 1)
    //    Request + Session transitions, re-request cycle, race condition
    // ==========================================
    {
      // Make sure the partial unique index exists before the race test
      await Session.init();
      const L = "Lifecycle";
      const ok = (name, cond, details = "") => recordResult(L, name, !!cond, details);

      // ---- helpers (fresh users per scenario so the unique (student, alumni) pair never collides)
      const mkUser = async (role, label) => {
        const email = `test_qa_lc_${label}_${TEST_TIMESTAMP}@example.com`;
        extraTestEmails.push(email);
        const r = await request("POST", "/api/auth/register", {
          name: `QA ${label}`, email, password: testPassword, role,
        });
        if (role === "alumni") {
          await request("PATCH", `/api/admin/verify/${r.data.user.id}`, { verify: true }, adminToken);
        }
        return { token: r.data.token, id: r.data.user.id };
      };
      const newPending = async (student, alumni) => {
        const r = await request("POST", "/api/mentorship/request", { alumniId: alumni.id }, student.token);
        return r.data?.request?._id;
      };
      const setStatus = (id, status, token) =>
        request("PATCH", `/api/mentorship/${id}/status`, { status }, token);
      const schedule = (id, token) =>
        request("POST", "/api/sessions", { requestId: id, date: FUTURE_DATE, time: "10:00" }, token);
      const setSession = (id, status, token) =>
        request("PATCH", `/api/sessions/${id}/status`, { status }, token);
      const reqStatus = async (id) => (await MentorshipRequest.findById(id)).status;
      const sesStatus = async (id) => (await Session.findById(id)).status;
      const sesCount = (id, extra = {}) => Session.countDocuments({ requestId: id, ...extra });

      const al = await mkUser("alumni", "alumni");     // the mentor used in most scenarios
      const al2 = await mkUser("alumni", "alumni2");   // an unrelated alumni
      const outsider = await mkUser("student", "outsider");

      // ---- S1: pending → accepted → scheduled → completed (via session)
      const s1 = await mkUser("student", "s1");
      const r1 = await newPending(s1, al);
      let res = await setStatus(r1, "accepted", al.token);
      ok("pending → accepted succeeds", res.status === 200 && (await reqStatus(r1)) === "accepted");

      res = await schedule(r1, al.token);
      const sid1 = res.data?.session?._id;
      ok("accepted → scheduled succeeds (via POST /sessions) and request is 'scheduled'",
        res.status === 201 && (await reqStatus(r1)) === "scheduled" && (await sesStatus(sid1)) === "scheduled");

      res = await setSession(sid1, "completed", al.token);
      ok("scheduled → completed succeeds; session AND request are 'completed'",
        res.status === 200 && (await sesStatus(sid1)) === "completed" && (await reqStatus(r1)) === "completed");

      // ---- S2: pending → rejected, then rejected → accepted must fail
      const s2 = await mkUser("student", "s2");
      const r2 = await newPending(s2, al);
      res = await setStatus(r2, "rejected", al.token);
      ok("pending → rejected succeeds", res.status === 200 && (await reqStatus(r2)) === "rejected");
      res = await setStatus(r2, "accepted", al.token);
      ok("rejected → accepted is rejected (409) and status is unchanged",
        res.status === 409 && (await reqStatus(r2)) === "rejected");

      // ---- S3: pending → cancelled by the student
      const s3 = await mkUser("student", "s3");
      const r3 = await newPending(s3, al);
      res = await setStatus(r3, "cancelled", s3.token);
      ok("pending → cancelled (own student) succeeds", res.status === 200 && (await reqStatus(r3)) === "cancelled");

      // ---- S4: pending → completed / scheduled must fail
      const s4 = await mkUser("student", "s4");
      const r4 = await newPending(s4, al);
      res = await setStatus(r4, "completed", al.token);
      ok("pending → completed is rejected (409)", res.status === 409 && (await reqStatus(r4)) === "pending");
      res = await setStatus(r4, "scheduled", al.token);
      ok("pending → scheduled is rejected (409)", res.status === 409 && (await reqStatus(r4)) === "pending");
      res = await schedule(r4, al.token);
      ok("POST /sessions on a pending request is rejected and creates no session",
        res.status === 400 && (await sesCount(r4)) === 0);

      // ---- S5: accepted → 'scheduled' through the status endpoint must fail (no session = no 'scheduled')
      const s5 = await mkUser("student", "s5");
      const r5 = await newPending(s5, al);
      await setStatus(r5, "accepted", al.token);
      res = await setStatus(r5, "scheduled", al.token);
      ok("accepted → scheduled via PATCH is rejected: no 'scheduled' request without a Session",
        res.status === 409 && (await reqStatus(r5)) === "accepted" && (await sesCount(r5)) === 0);

      // ---- S6: scheduled → cancelled, cancelled → completed fails, then a NEW cycle works
      const s6 = await mkUser("student", "s6");
      const r6 = await newPending(s6, al);
      await setStatus(r6, "accepted", al.token);
      const sid6a = (await schedule(r6, al.token)).data?.session?._id;
      res = await setSession(sid6a, "cancelled", al.token);
      ok("scheduled → cancelled succeeds; session AND request are 'cancelled'",
        res.status === 200 && (await sesStatus(sid6a)) === "cancelled" && (await reqStatus(r6)) === "cancelled");

      res = await setSession(sid6a, "completed", al.token);
      ok("cancelled → completed (session) is rejected (409) and nothing changes",
        res.status === 409 && (await sesStatus(sid6a)) === "cancelled" && (await reqStatus(r6)) === "cancelled");

      res = await request("POST", "/api/mentorship/request", { alumniId: al.id }, s6.token);
      ok("student can re-request after a cancelled session (request back to 'pending')",
        res.status === 200 && res.data.request?.status === "pending");
      res = await setStatus(r6, "accepted", al.token);
      ok("alumni accepts the new cycle", res.status === 200);
      res = await schedule(r6, al.token);
      const sid6b = res.data?.session?._id;
      ok("a NEW session can be scheduled after a cancelled one (no 'already created' error)",
        res.status === 201 && sid6b && String(sid6b) !== String(sid6a) && (await reqStatus(r6)) === "scheduled");
      ok("old cancelled session is kept as history; exactly one active session",
        (await sesCount(r6)) === 2 && (await sesCount(r6, { status: "cancelled" })) === 1 &&
        (await sesCount(r6, { status: "scheduled" })) === 1);
      res = await request("GET", `/api/sessions/${r6}`, null, s6.token);
      ok("GET /api/sessions/:requestId returns the latest (active) session",
        res.status === 200 && res.data.session?._id === sid6b);

      // ---- S7: completed → cancelled must fail (session and request)
      res = await setSession(sid1, "cancelled", al.token);
      ok("completed → cancelled (session) is rejected (409); session and request stay 'completed'",
        res.status === 409 && (await sesStatus(sid1)) === "completed" && (await reqStatus(r1)) === "completed");
      res = await setStatus(r1, "cancelled", s1.token);
      ok("completed request cannot be cancelled by the student (409)",
        res.status === 409 && (await reqStatus(r1)) === "completed");

      // ---- S8: UI 'Mark Done' (PATCH /mentorship/:id/status completed) keeps session in sync
      const s8 = await mkUser("student", "s8");
      const r8 = await newPending(s8, al);
      await setStatus(r8, "accepted", al.token);
      const sid8 = (await schedule(r8, al.token)).data?.session?._id;
      res = await setStatus(r8, "completed", al.token);
      ok("scheduled → completed via mentorship endpoint also completes the Session (no drift)",
        res.status === 200 && (await sesStatus(sid8)) === "completed" && (await reqStatus(r8)) === "completed");

      // ---- S9: concurrent scheduling — only ONE session may exist
      const s9 = await mkUser("student", "s9");
      const r9 = await newPending(s9, al);
      await setStatus(r9, "accepted", al.token);
      const burst = await Promise.all(Array.from({ length: 5 }, () => schedule(r9, al.token)));
      const created = burst.filter((x) => x.status === 201).length;
      const conflicts = burst.filter((x) => x.status === 409).length;
      ok("5 simultaneous schedule attempts → exactly one 201, the rest 409",
        created === 1 && conflicts === 4, `201s=${created} 409s=${conflicts}`);
      ok("only ONE session document exists and request is 'scheduled'",
        (await sesCount(r9)) === 1 && (await sesCount(r9, { status: "scheduled" })) === 1 &&
        (await reqStatus(r9)) === "scheduled");
      ok("duplicate attempts return a clean message (no raw MongoDB error leaked)",
        burst.filter((x) => x.status === 409).every((x) => x.data?.success === false && !/E11000|dup key|index/i.test(x.data?.message || "")));

      // ---- S10/S11: authorization on requests and sessions
      const s10 = await mkUser("student", "s10");
      const r10 = await newPending(s10, al);
      res = await setStatus(r10, "cancelled", outsider.token);
      ok("another student cannot cancel someone else's request (403)",
        res.status === 403 && (await reqStatus(r10)) === "pending");
      res = await setStatus(r10, "accepted", s10.token);
      ok("student cannot accept their own request (403)",
        res.status === 403 && (await reqStatus(r10)) === "pending");
      res = await setStatus(r10, "accepted", al2.token);
      ok("unrelated alumni cannot accept another alumni's request (403)",
        res.status === 403 && (await reqStatus(r10)) === "pending");
      res = await setStatus(r10, "rejected", al2.token);
      ok("unrelated alumni cannot reject another alumni's request (403)",
        res.status === 403 && (await reqStatus(r10)) === "pending");

      await setStatus(r10, "accepted", al.token);
      res = await schedule(r10, al2.token);
      ok("unrelated alumni cannot schedule a session for someone else's request (403)",
        res.status === 403 && (await sesCount(r10)) === 0);
      const sid10 = (await schedule(r10, al.token)).data?.session?._id;

      res = await setStatus(r10, "completed", s10.token);
      ok("student cannot mark their request 'completed' (403)",
        res.status === 403 && (await reqStatus(r10)) === "scheduled");

      const sessionAttackers = [
        ["owner student", s10.token, "completed"],
        ["owner student", s10.token, "cancelled"],
        ["unrelated student", outsider.token, "cancelled"],
        ["unrelated alumni", al2.token, "completed"],
      ];
      let allBlocked = true;
      for (const [, token, status] of sessionAttackers) {
        const r = await setSession(sid10, status, token);
        if (r.status !== 403) allBlocked = false;
      }
      ok("student / unrelated users cannot modify the session (403); session stays 'scheduled'",
        allBlocked && (await sesStatus(sid10)) === "scheduled" && (await reqStatus(r10)) === "scheduled");

      res = await setSession(sid10, "completed", adminToken);
      ok("admin can complete a session; request stays in sync",
        res.status === 200 && (await sesStatus(sid10)) === "completed" && (await reqStatus(r10)) === "completed");
    }


    // ==========================================
    // 9. SESSION INFO ON REQUEST CARDS (Phase 2)
    //    scheduledAt (UTC Date), meetLink validation, session attached to requests, access control
    // ==========================================
    {
      await Session.init();
      const P = "Phase2";
      const ok = (name, cond, details = "") => recordResult(P, name, !!cond, details);

      const mkUser = async (role, label) => {
        const email = `test_qa_p2_${label}_${TEST_TIMESTAMP}@example.com`;
        extraTestEmails.push(email);
        const r = await request("POST", "/api/auth/register", {
          name: `QA ${label}`, email, password: testPassword, role,
        });
        if (role === "alumni") {
          await request("PATCH", `/api/admin/verify/${r.data.user.id}`, { verify: true }, adminToken);
        }
        return { token: r.data.token, id: r.data.user.id };
      };
      const accepted = async (student, alumni) => {
        const r = await request("POST", "/api/mentorship/request", { alumniId: alumni.id }, student.token);
        const id = r.data?.request?._id;
        await request("PATCH", `/api/mentorship/${id}/status`, { status: "accepted" }, alumni.token);
        return id;
      };
      const schedule = (id, token, extra = {}) =>
        request("POST", "/api/sessions", { requestId: id, date: FUTURE_DATE, time: "17:00", ...extra }, token);
      const myRequests = async (user, who) =>
        (await request("GET", `/api/mentorship/${who}`, null, user.token)).data?.requests || [];

      const al = await mkUser("alumni", "alumni");
      const al2 = await mkUser("alumni", "alumni2");
      const stu = await mkUser("student", "stu");
      const other = await mkUser("student", "other");

      // ---- scheduledAt + meetLink stored correctly
      const r1 = await accepted(stu, al);
      const link = "https://meet.google.com/abc-defg-hij";
      let res = await schedule(r1, al.token, { meetLink: link, notes: "Agenda" });
      const sid1 = res.data?.session?._id;
      const stored = await Session.findById(sid1);
      ok("valid HTTPS meetLink is accepted (201) and stored",
        res.status === 201 && stored.meetLink === link);
      ok("17:00 on FUTURE_DATE (default zone Asia/Kolkata) is stored as a UTC Date 11:30Z",
        stored.scheduledAt instanceof Date && stored.scheduledAt.toISOString() === `${FUTURE_DATE}T11:30:00.000Z` &&
        stored.timezone === "Asia/Kolkata" && !stored.date && !stored.time,
        stored.scheduledAt && stored.scheduledAt.toISOString());
      ok("POST /sessions response exposes scheduledAt (ISO), meetLink, status",
        res.data.session?.scheduledAt === `${FUTURE_DATE}T11:30:00.000Z` && res.data.session?.meetLink === link &&
        res.data.session?.status === "scheduled");

      // ---- request list returns request → session
      let list = await myRequests(stu, "student");
      let card = list.find((x) => x._id === r1);
      ok("student's scheduled request returns its session {id, scheduledAt, meetLink, status}",
        card?.status === "scheduled" && card.session?.id === sid1 && card.session.meetLink === link &&
        card.session.scheduledAt === `${FUTURE_DATE}T11:30:00.000Z` && card.session.status === "scheduled");
      list = await myRequests(al, "alumni");
      card = list.find((x) => x._id === r1);
      ok("alumni's scheduled request returns the SAME session / meetLink",
        card?.session?.id === sid1 && card.session.meetLink === link && card.session.scheduledAt === `${FUTURE_DATE}T11:30:00.000Z`);

      // ---- access control
      res = await request("GET", `/api/sessions/${r1}`, null, stu.token);
      ok("student can access their own scheduled session (200)",
        res.status === 200 && res.data.session?._id === sid1 && res.data.session.meetLink === link);
      res = await request("GET", `/api/sessions/${r1}`, null, al.token);
      ok("alumni can access the session of their own request (200)", res.status === 200 && res.data.session?._id === sid1);
      res = await request("GET", `/api/sessions/${r1}`, null, other.token);
      ok("unrelated student cannot access the session (403)", res.status === 403 && !res.data.session);
      res = await request("GET", `/api/sessions/${r1}`, null, al2.token);
      ok("unrelated alumni cannot access the session (403)", res.status === 403 && !res.data.session);
      res = await request("GET", `/api/sessions/${r1}`, null, adminToken);
      ok("admin can still access sessions (existing authorization design)", res.status === 200);
      ok("session data never leaks into an unrelated user's request lists",
        !(await myRequests(other, "student")).some((x) => x._id === r1) &&
        !(await myRequests(al2, "alumni")).some((x) => x._id === r1));

      // ---- meetLink validation (backend is the boundary)
      const r2 = await accepted(await mkUser("student", "stu2"), al);
      const badLinks = [
        "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>",
        "file:///etc/passwd", "http://meet.google.com/abc", "ftp://meet.example.com/x",
        "https://user:pass@meet.google.com/x", "//evil.com", "https://localhost/x", "https://meet.google.com/a b", 12345,
      ];
      let allRejected = true;
      for (const bad of badLinks) {
        const r = await schedule(r2, al.token, { meetLink: bad });
        if (r.status !== 400 || r.data?.success !== false) { allRejected = false; console.log("    not rejected:", bad, r.status); }
      }
      ok("javascript:, data:, file:, http:, ftp:, credentials, localhost, spaces and non-strings are rejected (400)", allRejected);
      ok("rejected links create no session and leave the request 'accepted'",
        (await Session.countDocuments({ requestId: r2 })) === 0 && (await MentorshipRequest.findById(r2)).status === "accepted");
      res = await schedule(r2, al.token, { meetLink: "   " });
      const noLink = await Session.findById(res.data?.session?._id);
      ok("meetLink is optional (blank → null) and the session is still created", res.status === 201 && noLink.meetLink === null);
      ok("scheduled request WITHOUT a link returns session.meetLink = null (UI shows no Meet button)",
        (await myRequests(al, "alumni")).find((x) => x._id === r2)?.session?.meetLink === null);

      // ---- date/time handling
      const r3 = await accepted(await mkUser("student", "stu3"), al);
      res = await schedule(r3, al.token, { date: "2020-01-01" });
      ok("session in the past is rejected (400)", res.status === 400);
      res = await request("POST", "/api/sessions", { requestId: r3, scheduledAt: `${FUTURE_DATE}T10:00:00` }, al.token);
      ok("scheduledAt without a UTC offset is rejected as ambiguous (400)", res.status === 400);
      res = await schedule(r3, al.token, { timeZone: "Mars/Base" });
      ok("invalid timeZone is rejected (400)", res.status === 400);
      res = await schedule(r3, al.token, { date: "2099-02-31" });
      ok("impossible calendar date is rejected (400)", res.status === 400);
      res = await request("POST", "/api/sessions", { requestId: r3, date: FUTURE_DATE, time: "10:00", timeZone: "UTC" }, al.token);
      const utcSession = await Session.findById(res.data?.session?._id);
      ok("explicit timeZone is honoured (10:00 UTC → 10:00Z) and stored",
        res.status === 201 && utcSession.scheduledAt.toISOString() === `${FUTURE_DATE}T10:00:00.000Z` && utcSession.timezone === "UTC");

      // ---- Meet-button data rules (what the UI keys off)
      const r4 = await accepted(await mkUser("student", "stu4"), al);
      const stu4 = (await myRequests(al, "alumni")).find((x) => x._id === r4);
      ok("pending/accepted request has session = null (no Meet button)", stu4?.status === "accepted" && stu4.session === null);

      const st5 = await mkUser("student", "stu5");
      const pendingId = (await request("POST", "/api/mentorship/request", { alumniId: al.id }, st5.token)).data?.request?._id;
      ok("pending request has session = null",
        (await myRequests(st5, "student")).find((x) => x._id === pendingId)?.session === null);

      const st6 = await mkUser("student", "stu6");
      const r6 = await accepted(st6, al);
      const sid6 = (await schedule(r6, al.token, { meetLink: link })).data?.session?._id;
      await request("PATCH", `/api/sessions/${sid6}/status`, { status: "cancelled" }, al.token);
      let c6 = (await myRequests(st6, "student")).find((x) => x._id === r6);
      ok("cancelled session → request is 'cancelled' and session = null (no Meet link served)",
        c6?.status === "cancelled" && c6.session === null && !JSON.stringify(c6).includes("meet.google.com"));

      const st7 = await mkUser("student", "stu7");
      const r7 = await accepted(st7, al);
      const sid7 = (await schedule(r7, al.token, { meetLink: link })).data?.session?._id;
      await request("PATCH", `/api/sessions/${sid7}/status`, { status: "completed" }, al.token);
      const c7 = (await myRequests(st7, "student")).find((x) => x._id === r7);
      ok("completed request returns its completed session (card shows no Meet; Details modal keeps working)",
        c7?.status === "completed" && c7.session?.status === "completed" && c7.session.id === sid7);

      // new cycle after cancel: card shows the NEW session, not the cancelled one
      await request("POST", "/api/mentorship/request", { alumniId: al.id }, st6.token);
      await request("PATCH", `/api/mentorship/${r6}/status`, { status: "accepted" }, al.token);
      const sid6b = (await schedule(r6, al.token, { meetLink: "https://meet.google.com/new-cycle-link" })).data?.session?._id;
      c6 = (await myRequests(st6, "student")).find((x) => x._id === r6);
      ok("after a cancelled cycle, the request card returns the NEW scheduled session",
        c6?.status === "scheduled" && c6.session?.id === sid6b && c6.session.meetLink === "https://meet.google.com/new-cycle-link");

      // ---- legacy data (created before Phase 2): derived scheduledAt, unsafe link never served
      const stL = await mkUser("student", "legacy");
      const rL = await accepted(stL, al);
      await MentorshipRequest.updateOne({ _id: rL }, { $set: { status: "scheduled" } });
      await Session.collection.insertOne({
        requestId: new mongoose.Types.ObjectId(rL), date: "2099-01-01", time: "10:00",
        notes: "", status: "scheduled", meetLink: "javascript:alert(1)", createdAt: new Date(), updatedAt: new Date(),
      });
      const cL = (await myRequests(stL, "student")).find((x) => x._id === rL);
      ok("legacy session (date/time strings) gets a derived scheduledAt (10:00 IST → 04:30Z)",
        cL?.session?.scheduledAt === "2099-01-01T04:30:00.000Z");
      ok("legacy session with an unsafe stored meetLink never serves it (null)",
        cL?.session?.meetLink === null);
      res = await request("GET", `/api/sessions/${rL}`, null, stL.token);
      ok("GET /sessions/:requestId also hides the unsafe legacy link",
        res.status === 200 && res.data.session?.meetLink === null && res.data.session?.scheduledAt === "2099-01-01T04:30:00.000Z");
    }


    // ==========================================
    // 10. NOTIFICATIONS + SESSION REMINDERS (Phase 3)
    //     The email provider is ALWAYS mocked here — no real email is ever sent.
    // ==========================================
    {
      await Session.init(); await Notification.init(); await SessionReminder.init();
      const R = "Phase3";
      const ok = (name, cond, details = "") => recordResult(R, name, !!cond, details);
      const MIN = 60 * 1000;
      const T = new Date();                                  // the tick's "now"
      const at = (ms) => new Date(T.getTime() + ms);          // T + ms
      const LINK = "https://meet.google.com/rem-inde-rrr";

      const mkUser = async (role, label) => {
        const email = `test_qa_p3_${label}_${TEST_TIMESTAMP}@example.com`;
        extraTestEmails.push(email);
        const r = await request("POST", "/api/auth/register", { name: `QA ${label}`, email, password: testPassword, role });
        if (role === "alumni") await request("PATCH", `/api/admin/verify/${r.data.user.id}`, { verify: true }, adminToken);
        return { token: r.data.token, id: r.data.user.id, email, name: `QA ${label}` };
      };
      // fake email provider: records what it was asked to send; can be told to fail for some recipients
      const makeSender = ({ failFor = [], delayMs = 0 } = {}) => {
        const fn = async (args) => {
          fn.attempts.push(args.to);
          if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
          if (failFor.includes(args.to)) throw new Error("SMTP down (simulated)");
          fn.sent.push(args);
          return { accepted: [args.to] };
        };
        fn.sent = []; fn.attempts = [];
        return fn;
      };
      // a scheduled session whose scheduledAt we then set to T + offsetMs (simulates "time passing")
      const makeSession = async (student, alumni, offsetMs) => {
        const rr = await request("POST", "/api/mentorship/request", { alumniId: alumni.id }, student.token);
        const rid = rr.data?.request?._id;
        await request("PATCH", `/api/mentorship/${rid}/status`, { status: "accepted" }, alumni.token);
        const res = await request("POST", "/api/sessions", { requestId: rid, date: FUTURE_DATE, time: "17:00", meetLink: LINK }, alumni.token);
        const sid = res.data?.session?._id;
        await Session.updateOne({ _id: sid }, { $set: { scheduledAt: at(offsetMs) } });
        return { rid, sid };
      };
      const tick = (sid, sender, now = T) => reminderService.runReminderTick({ now, emailSender: sender, sessionIds: [sid] });
      const reminders = (sid) => SessionReminder.find({ sessionId: sid }).sort({ scheduledAt: 1 });
      const notes = (userId, sid) => Notification.find({ userId, relatedSessionId: sid }).select("+dedupeKey");

      const stu = await mkUser("student", "stu");
      const other = await mkUser("student", "other");
      const al = await mkUser("alumni", "alumni");

      // ================= Notification API (1–5) =================
      const n1 = await Notification.create({ userId: stu.id, type: "SESSION_REMINDER", title: "Mentorship Session Reminder", message: "Your mentorship session with X starts in 30 minutes." });
      const n2 = await Notification.create({ userId: other.id, type: "SESSION_REMINDER", title: "Mentorship Session Reminder", message: "Other user's notification" });

      let res = await request("GET", "/api/notifications", null, stu.token);
      ok("authenticated user can get their own notifications (+ unreadCount)",
        res.status === 200 && res.data.notifications.some((n) => n._id === String(n1._id)) && res.data.unreadCount >= 1);
      ok("dedupeKey (internal) is never exposed to the client",
        res.data.notifications.every((n) => !("dedupeKey" in n)));
      res = await request("GET", "/api/notifications");
      ok("unauthenticated user cannot get notifications (401)", res.status === 401);
      res = await request("GET", `/api/notifications?userId=${stu.id}`, null, other.token);
      ok("user cannot read another user's notifications (client-sent userId is ignored)",
        res.status === 200 && res.data.notifications.every((n) => String(n.userId) === other.id) &&
        !res.data.notifications.some((n) => n._id === String(n1._id)));

      res = await request("PATCH", `/api/notifications/${n2._id}/read`, null, stu.token);
      ok("user cannot mark another user's notification as read (404, unchanged)",
        res.status === 404 && (await Notification.findById(n2._id)).isRead === false);
      res = await request("PATCH", `/api/notifications/${n1._id}/read`, null, stu.token);
      ok("user can mark their own notification as read",
        res.status === 200 && res.data.notification.isRead === true && (await Notification.findById(n1._id)).isRead === true);
      res = await request("PATCH", "/api/notifications/not-an-id/read", null, stu.token);
      ok("invalid notification id is rejected (400)", res.status === 400);
      res = await request("PATCH", "/api/notifications/read-all", null, stu.token);
      ok("read-all only affects the caller's notifications",
        res.status === 200 && (await Notification.findById(n2._id)).isRead === false);
      res = await request("PATCH", `/api/notifications/${n1._id}/read`);
      ok("marking read without a token is rejected (401)", res.status === 401);

      // ================= Reminder eligibility (6–10) =================
      let s = await makeSession(stu, al, 30 * MIN);
      let sender = makeSender();
      let sum = await tick(s.sid, sender);
      ok("session exactly 30 minutes away becomes eligible", sum.claimed === 1 && sum.completed === 1 && (await reminders(s.sid)).length === 1);

      s = await makeSession(await mkUser("student", "e2"), al, 30 * MIN + 1000);
      sender = makeSender(); sum = await tick(s.sid, sender);
      ok("session more than 30 minutes away is NOT eligible",
        sum.due === 0 && (await reminders(s.sid)).length === 0 && sender.sent.length === 0);

      const stC = await mkUser("student", "e3");
      s = await makeSession(stC, al, 10 * MIN);
      await request("PATCH", `/api/sessions/${s.sid}/status`, { status: "cancelled" }, al.token);
      sender = makeSender(); sum = await tick(s.sid, sender);
      ok("cancelled session is ignored", sum.due === 0 && sender.attempts.length === 0 && (await reminders(s.sid)).length === 0);

      s = await makeSession(await mkUser("student", "e4"), al, 10 * MIN);
      await request("PATCH", `/api/sessions/${s.sid}/status`, { status: "completed" }, al.token);
      sender = makeSender(); sum = await tick(s.sid, sender);
      ok("completed session is ignored", sum.due === 0 && sender.attempts.length === 0 && (await reminders(s.sid)).length === 0);

      s = await makeSession(await mkUser("student", "e5"), al, 10 * MIN);
      await Session.deleteOne({ _id: s.sid });
      sender = makeSender(); sum = await tick(s.sid, sender);
      ok("deleted session is ignored", sum.due === 0 && sender.attempts.length === 0 && (await reminders(s.sid)).length === 0);

      s = await makeSession(await mkUser("student", "e6"), al, -1 * MIN);
      sender = makeSender(); sum = await tick(s.sid, sender);
      ok("session that already started gets no 'starts in…' reminder", sum.due === 0 && sender.attempts.length === 0);

      const stLate = await mkUser("student", "late");
      s = await makeSession(stLate, al, 10 * MIN);
      sender = makeSender(); sum = await tick(s.sid, sender);
      const lateNote = (await notes(stLate.id, s.sid))[0];
      ok("session scheduled <30 min before start is eligible immediately and states the real minutes left",
        sum.completed === 1 && sender.sent.length === 2 && sender.sent.every((m) => m.minutesLeft === 10) &&
        lateNote?.message === `Your mentorship session with ${al.name} starts in 10 minutes.`);

      // ================= Delivery (11–14) =================
      const stD = await mkUser("student", "deliver");
      s = await makeSession(stD, al, 30 * MIN);
      sender = makeSender(); sum = await tick(s.sid, sender);
      const toStudent = sender.sent.find((m) => m.to === stD.email);
      const toAlumni = sender.sent.find((m) => m.to === al.email);
      const studentMail = toStudent ? emailService.buildSessionReminderEmail(toStudent) : { subject: "", text: "" };
      const alumniMail = toAlumni ? emailService.buildSessionReminderEmail(toAlumni) : { subject: "", text: "" };
      ok("student receives the reminder email (recipient resolved from MongoDB, other party named, link included)",
        toStudent && toStudent.role === "student" && toStudent.otherName === al.name && toStudent.meetLink === LINK &&
        studentMail.subject === "Mentorship Session Reminder — Starting in 30 Minutes" &&
        studentMail.text.includes(`Hi ${stD.name},`) && studentMail.text.includes(`session with ${al.name}`) &&
        studentMail.text.includes(LINK) && studentMail.text.includes("starts in 30 minutes"));
      ok("alumni receives the reminder email (equivalent content)",
        toAlumni && toAlumni.role === "alumni" && toAlumni.otherName === stD.name &&
        alumniMail.text.includes(`session with ${stD.name}`) && alumniMail.text.includes(LINK));
      const [sN, aN] = [(await notes(stD.id, s.sid)), (await notes(al.id, s.sid))];
      ok("student receives the in-app notification (type, title, message, related ids)",
        sN.length === 1 && sN[0].type === "SESSION_REMINDER" && sN[0].title === "Mentorship Session Reminder" &&
        sN[0].message === `Your mentorship session with ${al.name} starts in 30 minutes.` &&
        String(sN[0].relatedRequestId) === s.rid && String(sN[0].relatedSessionId) === s.sid && sN[0].isRead === false);
      ok("alumni receives the in-app notification",
        aN.length === 1 && aN[0].message === `Your mentorship session with ${stD.name} starts in 30 minutes.`);
      ok("email goes to exactly the two registered participants",
        sender.sent.length === 2 && new Set(sender.sent.map((m) => m.to)).size === 2);

      // the real email service never touches the network under NODE_ENV=test
      emailService._resetTransporterForTests();
      const info = await emailService.sendSessionReminderEmail({ to: stD.email, recipientName: "A", otherName: "B", role: "student", scheduledAt: at(30 * MIN), timezone: "Asia/Kolkata", meetLink: LINK, minutesLeft: 30 });
      ok("real email service uses the offline test transport (no real email in tests)",
        typeof info.message === "string" && JSON.parse(info.message).subject.startsWith("Mentorship Session Reminder"));
      let badRecipient = false;
      try { await emailService.sendSessionReminderEmail({ to: "not-an-email", recipientName: "A", otherName: "B" }); } catch { badRecipient = true; }
      ok("invalid recipient address is rejected by the email service", badRecipient);
      const xss = emailService.buildSessionReminderEmail({ recipientName: "<script>x</script>", otherName: "A&B", role: "student", scheduledAt: at(MIN), timezone: "Asia/Kolkata", meetLink: "javascript:alert(1)", minutesLeft: 5 });
      ok("email HTML escapes names and never links an unsafe URL",
        !xss.html.includes("<script>") && xss.html.includes("&lt;script&gt;") && !xss.html.includes("javascript:") && !xss.text.includes("javascript:"));

      // ================= Duplicate prevention (15–17) =================
      ok("running the scheduler a second time creates no duplicate notifications",
        (await tick(s.sid, sender)).claimed === 0 && (await notes(stD.id, s.sid)).length === 1 && (await notes(al.id, s.sid)).length === 1);
      ok("running the scheduler a second time sends no duplicate emails", sender.sent.length === 2);
      const rem = (await reminders(s.sid))[0];
      ok("reminder record is marked completed (all four steps)",
        rem.completedAt && rem.studentEmailSentAt && rem.alumniEmailSentAt && rem.studentNotifiedAt && rem.alumniNotifiedAt);

      // DB-level backstop: even if a "notified" flag were lost, the notification can't be duplicated
      await SessionReminder.updateOne({ _id: rem._id }, { $set: { studentNotifiedAt: null, completedAt: null, lockedUntil: null } });
      await tick(s.sid, sender);
      ok("unique dedupeKey prevents a duplicate notification even if a flag is lost",
        (await notes(stD.id, s.sid)).length === 1 && sender.sent.length === 2);

      const stR = await mkUser("student", "race");
      s = await makeSession(stR, al, 30 * MIN);
      sender = makeSender({ delayMs: 25 });
      const sums = await Promise.all(Array.from({ length: 6 }, () => tick(s.sid, sender)));
      ok("6 concurrent scheduler runs process the reminder exactly once",
        sums.reduce((a, x) => a + x.claimed, 0) === 1 && sender.sent.length === 2 &&
        (await reminders(s.sid)).length === 1 && (await notes(stR.id, s.sid)).length === 1 && (await notes(al.id, s.sid)).length === 1);

      // ================= Rescheduling (18–19) =================
      const stS = await mkUser("student", "resched");
      s = await makeSession(stS, al, 25 * MIN);
      sender = makeSender();
      await tick(s.sid, sender);                                        // reminder for the ORIGINAL time
      ok("reminder fires for the original time", sender.sent.length === 2 && (await reminders(s.sid)).length === 1);
      const newTime = at(3 * 60 * MIN);                                  // rescheduled to T + 3h
      await Session.updateOne({ _id: s.sid }, { $set: { scheduledAt: newTime } });
      sum = await tick(s.sid, sender, at(60 * MIN));
      ok("after rescheduling, nothing fires at the old time", sum.due === 0 && sender.sent.length === 2);
      sum = await tick(s.sid, sender, new Date(newTime.getTime() - 29 * MIN));
      const rems = await reminders(s.sid);
      ok("rescheduled session gets a NEW reminder based on the new scheduledAt",
        sum.completed === 1 && rems.length === 2 && rems[1].scheduledAt.getTime() === newTime.getTime() &&
        sender.sent.length === 4 && new Date(sender.sent[3].scheduledAt).getTime() === newTime.getTime() &&
        sender.sent[3].minutesLeft === 29);
      ok("each time gets its own notification (no collision between old and new reminder)",
        (await notes(stS.id, s.sid)).length === 2);

      const stS2 = await mkUser("student", "resched2");
      s = await makeSession(stS2, al, 2 * 60 * MIN);                      // reminder would be due at T + 1h30
      sender = makeSender();
      const later = at(5 * 60 * MIN);
      await Session.updateOne({ _id: s.sid }, { $set: { scheduledAt: later } }); // rescheduled BEFORE it fired
      sum = await tick(s.sid, sender, at(95 * MIN));                      // the OLD reminder time has passed
      ok("old reminder does not fire after rescheduling", sum.due === 0 && sender.attempts.length === 0 && (await reminders(s.sid)).length === 0);
      sum = await tick(s.sid, sender, new Date(later.getTime() - 30 * MIN));
      ok("it fires at the NEW reminder time instead", sum.completed === 1 && sender.sent.length === 2 &&
        new Date(sender.sent[0].scheduledAt).getTime() === later.getTime());

      // ================= Failure handling (20–22) =================
      const stF = await mkUser("student", "fail1");
      s = await makeSession(stF, al, 30 * MIN);
      sender = makeSender({ failFor: [stF.email] });
      let threw = false; try { sum = await tick(s.sid, sender); } catch { threw = true; }
      let rm = (await reminders(s.sid))[0];
      ok("student email failure does not crash the scheduler (reminder stays incomplete)",
        !threw && sum.partial === 1 && !rm.completedAt && rm.studentEmailSentAt === null && /Student email/.test(rm.lastError || ""));
      ok("…and one user's failure does not stop the other's delivery (both attempted, alumni still emailed + both notified)",
        sender.attempts.includes(stF.email) && sender.attempts.includes(al.email) && sender.sent.length === 1 &&
        sender.sent[0].to === al.email && rm.alumniEmailSentAt && rm.studentNotifiedAt && rm.alumniNotifiedAt);
      sum = await tick(s.sid, sender, at(10 * 1000));
      ok("a failed reminder waits before retrying (no hot loop)", sum.claimed === 0);
      const retry = makeSender();
      sum = await tick(s.sid, retry, at(reminderService.RETRY_DELAY_MS + 1000));
      rm = (await reminders(s.sid))[0];
      ok("retry sends ONLY the missing email — the alumni is not emailed again",
        sum.completed === 1 && retry.sent.length === 1 && retry.sent[0].to === stF.email && rm.completedAt);

      const stF2 = await mkUser("student", "fail2");
      s = await makeSession(stF2, al, 30 * MIN);
      sender = makeSender({ failFor: [al.email] });
      threw = false; try { sum = await tick(s.sid, sender); } catch { threw = true; }
      rm = (await reminders(s.sid))[0];
      ok("alumni email failure does not crash the scheduler",
        !threw && sum.partial === 1 && rm.alumniEmailSentAt === null && rm.studentEmailSentAt && /Alumni email/.test(rm.lastError || ""));

      const stF3 = await mkUser("student", "fail3");
      s = await makeSession(stF3, al, 30 * MIN);
      sender = makeSender({ failFor: [stF3.email] });
      for (let i = 0; i < reminderService.MAX_ATTEMPTS + 2; i++) await tick(s.sid, sender, at(i * (reminderService.RETRY_DELAY_MS + 1000)));
      rm = (await reminders(s.sid))[0];
      ok("a permanently failing email stops after MAX_ATTEMPTS and never re-emails the other person",
        rm.exhaustedAt && !rm.completedAt && rm.attempts === reminderService.MAX_ATTEMPTS &&
        sender.attempts.filter((x) => x === stF3.email).length === reminderService.MAX_ATTEMPTS &&
        sender.sent.length === 1 && sender.sent[0].to === al.email);

      // invalid / missing address stored in the DB → handled, not a crash (real service, offline transport)
      const stBad = await mkUser("student", "bademail");
      s = await makeSession(stBad, al, 30 * MIN);
      await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(stBad.id) }, { $set: { email: "not-an-email" } });
      emailService._resetTransporterForTests();
      threw = false; try { sum = await reminderService.runReminderTick({ now: T, sessionIds: [s.sid] }); } catch { threw = true; }
      rm = (await reminders(s.sid))[0];
      ok("a user with a missing/invalid email does not crash the scheduler or block the other user",
        !threw && sum.partial === 1 && rm.alumniEmailSentAt && rm.studentEmailSentAt === null && !rm.completedAt);
      // restore the real address so the end-of-run cleanup (which finds test users by email) still matches
      await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(stBad.id) }, { $set: { email: stBad.email } });

      // ================= Admin delete cascades Phase-3 data =================
      const stDel = await mkUser("student", "delstu");
      const alDel = await mkUser("alumni", "delalu");
      s = await makeSession(stDel, alDel, 30 * MIN);
      await tick(s.sid, makeSender());
      const hadData = (await Notification.countDocuments({ relatedSessionId: s.sid })) === 2 &&
        (await SessionReminder.countDocuments({ sessionId: s.sid })) === 1;
      res = await request("DELETE", `/api/admin/users/${alDel.id}`, null, adminToken);
      ok("admin deleting a user also removes their reminders and notifications (no orphans)",
        hadData && res.status === 200 &&
        (await SessionReminder.countDocuments({ sessionId: s.sid })) === 0 &&
        (await Notification.countDocuments({ relatedSessionId: s.sid })) === 0 &&
        (await Session.countDocuments({ _id: s.sid })) === 0);

      // ================= Cron trigger endpoint =================
      const prevSecret = process.env.CRON_SECRET;
      delete process.env.CRON_SECRET;
      res = await request("POST", "/api/internal/reminders/run");
      ok("external trigger is disabled (404) when CRON_SECRET is not set", res.status === 404);
      process.env.CRON_SECRET = "test-cron-secret-123";
      res = await fetch(`${baseUrl}/api/internal/reminders/run`, { method: "POST" });
      ok("external trigger rejects a missing secret (401)", res.status === 401);
      res = await fetch(`${baseUrl}/api/internal/reminders/run`, { method: "POST", headers: { "x-cron-secret": "wrong" } });
      ok("external trigger rejects a wrong secret (401)", res.status === 401);
      if (prevSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prevSecret;
    }

  } catch (err) {
    console.error("Critical error in test runner:", err);
    recordResult("Runner", "Fatal exception in test suite", false, err.message);
  } finally {
    // ==========================================
    // CLEANUP EPHEMERAL TEST DATA ONLY
    // ==========================================
    console.log("\nCleaning up ephemeral test data...");
    try {
      const testEmails = [testAdminEmail, testStudentEmail, testStudent2Email, testAlumniEmail, ...extraTestEmails];
      const testUsers = await User.find({ email: { $in: testEmails } }).select("_id");
      const testUserIds = testUsers.map((u) => u._id);

      if (testUserIds.length > 0) {
        const testReqs = await MentorshipRequest.find({
          $or: [{ studentId: { $in: testUserIds } }, { alumniId: { $in: testUserIds } }],
        }).select("_id");
        const testReqIds = testReqs.map((r) => r._id);

        const testSessions = await Session.find({ requestId: { $in: testReqIds } }).select("_id");
        await SessionReminder.deleteMany({ sessionId: { $in: testSessions.map((x) => x._id) } });
        await Notification.deleteMany({ userId: { $in: testUserIds } });
        await Session.deleteMany({ requestId: { $in: testReqIds } });
        await MentorshipRequest.deleteMany({ _id: { $in: testReqIds } });
        await Post.deleteMany({ userId: { $in: testUserIds } });
        await User.deleteMany({ _id: { $in: testUserIds } });
      }
      console.log("Cleanup complete: real data preserved intact.");
    } catch (cleanErr) {
      console.error("Cleanup error:", cleanErr.message);
    }

    if (server) {
      server.close();
    }
    await mongoose.disconnect();
  }

  // ==========================================
  // SUMMARY REPORT
  // ==========================================
  const total = testResults.length;
  const passed = testResults.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log("\n========================================================");
  console.log(`TEST SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();

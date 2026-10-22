// require("dotenv").config({ path: "../.env" });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const app = express();

// Behind a reverse proxy (Render / Railway / Nginx) the real client IP is in X-Forwarded-For.
// Without this, every user shares the proxy IP and the auth rate limiter blocks everyone together.
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

// ── Security ──────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.CLIENT_ORIGIN || "https://your-domain.com"
        : "http://localhost:5173",
    credentials: true,
  })
);

// ── Rate limiting (auth routes only) ─────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

// ── Body parsing ──────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ───────────────────────────────────────────────────
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));

// ── Routes ────────────────────────────────────────────────────
app.use("/api/auth", authLimiter, require("./routes/authRoutes"));
app.use("/api/upload", require("./routes/uploadRoutes")); // profile photo (Cloudinary)
app.use("/api/mentorship", require("./routes/mentorshipRoutes"));
app.use("/api/sessions", require("./routes/sessionRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/posts", require("./routes/postRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/internal", require("./routes/internalRoutes")); // cron trigger (disabled unless CRON_SECRET is set)

// ── Health check ─────────────────────────────────────────────
app.get("/api/health", (_, res) =>
  res.json({ success: true, message: "SaarthiX API is running ✅", env: process.env.NODE_ENV })
);

// ── 404 handler ───────────────────────────────────────────────
app.use("*", (_, res) =>
  res.status(404).json({ success: false, message: "Route not found" })
);

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  // Syntax error from body-parser
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ success: false, message: "Invalid JSON syntax." });
  }

  // Mongoose CastError (e.g. invalid ObjectId)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid format for field '${err.path}'.`,
    });
  }

  // Mongoose ValidationError
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join(". "),
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {});
    return res.status(409).json({
      success: false,
      message: `Duplicate value entered for ${fields.join(", ") || "unique field"}.`,
    });
  }

  if (process.env.NODE_ENV !== "test") {
    console.error("🔴 Error:", err.stack || err.message);
  }

  const statusCode = err.status || err.statusCode || 500;
  const message =
    statusCode === 500 && process.env.NODE_ENV === "production"
      ? "Internal Server Error"
      : err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    message,
  });
});

module.exports = app;
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const app = require("./app");
const connectDB = require("./config/db");
const emailService = require("./services/emailService");
const reminderScheduler = require("./services/reminderScheduler");

const PORT = process.env.PORT || 5000;

const maskMongoUri = (uri) => {
  if (!uri) return "Not configured";
  try {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@");
  } catch {
    return "[hidden]";
  }
};

const startServer = async () => {
  if (!process.env.JWT_SECRET) {
    console.error("❌ JWT_SECRET is not set. Add it to server/.env (or your host's environment variables).");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && !process.env.CLIENT_ORIGIN) {
    console.warn("⚠️  CLIENT_ORIGIN is not set — browsers will be blocked by CORS. Set it to your frontend URL.");
  }
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📦 Environment : ${process.env.NODE_ENV || "development"}`);
    console.log(`🗄️  Database    : ${maskMongoUri(process.env.MONGO_URI)}\n`);

    // Session reminders (30 min before). DB-driven; set ENABLE_REMINDER_SCHEDULER=false to disable.
    if (process.env.ENABLE_REMINDER_SCHEDULER !== "false") {
      if (!emailService.isConfigured()) {
        console.warn("[Email] EMAIL_HOST / EMAIL_USER / EMAIL_PASSWORD not set — reminder emails will " +
          (process.env.NODE_ENV === "production" ? "FAIL (in-app notifications still work)." : "only be logged (dev mode)."));
      }
      reminderScheduler.start();
    }
  });
};

startServer();

/*
 * Run once to create the initial admin account:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=your-strong-password node server/scripts/createAdmin.js
 */

const path = require("path");
const fs = require("fs");

const serverEnv = path.resolve(__dirname, "../.env");
const rootEnv = path.resolve(__dirname, "../../.env");
if (fs.existsSync(serverEnv)) {
  require("dotenv").config({ path: serverEnv });
} else if (fs.existsSync(rootEnv)) {
  require("dotenv").config({ path: rootEnv });
} else {
  require("dotenv").config();
}

const mongoose = require("mongoose");
const User = require("../models/User");

// Credentials come from the environment (ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD).
// A well-known default password is allowed ONLY outside production, for local development.
const isProd = process.env.NODE_ENV === "production";
const usingEnvPassword = !!process.env.ADMIN_PASSWORD;
const ADMIN = {
  name: process.env.ADMIN_NAME || "Admin",
  email: (process.env.ADMIN_EMAIL || "admin@saarthix.com").toLowerCase(),
  password: process.env.ADMIN_PASSWORD || (isProd ? "" : "Admin@1234"),
  role: "admin",
};

(async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing. Please check your .env file.");
    }
    if (!ADMIN.password || ADMIN.password.length < 8) {
      throw new Error("Set ADMIN_PASSWORD (min 8 characters) in the environment before creating the admin.");
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const exists = await User.findOne({ email: ADMIN.email });
    if (exists) {
      console.log(`⚠️  Admin already exists: ${ADMIN.email}`);
      await mongoose.disconnect();
      process.exit(0);
    }

    await User.create(ADMIN);
    console.log(`\n✅ Admin created successfully!`);
    console.log(`   Email    : ${ADMIN.email}`);
    if (!usingEnvPassword) {
      console.log(`   Password : ${ADMIN.password}   (local default — change it!)`);
    }
    console.log("");
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  }
})();

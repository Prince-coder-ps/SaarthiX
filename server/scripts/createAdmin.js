/*
 * Run once to create the initial admin account
 */

require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");
const User = require("../models/User");

const ADMIN = {
  name: "Admin",
  email: "admin@saarthix.com",
  password: "Admin@1234",
  role: "admin",
};

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const exists = await User.findOne({ email: ADMIN.email });
    if (exists) {
      console.log(`⚠️  Admin already exists: ${ADMIN.email}`);
      process.exit(0);
    }

    await User.create(ADMIN);
    console.log(`\n✅ Admin created successfully!`);
    console.log(`   Email    : ${ADMIN.email}`);
    console.log(`   Password : ${ADMIN.password}`);
    console.log(`\n⚠️  Change the password after first login!\n`);
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
})();

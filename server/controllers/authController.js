const jwt = require("jsonwebtoken");
const User = require("../models/User");

/** Helper: sign a JWT */
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

/** Helper: build safe user object (no password) */
const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  batch: user.batch,
  domain: user.domain,
  company: user.company,
  bio: user.bio,
  isVerified: user.isVerified,
  createdAt: user.createdAt,
});

// ===== POST /api/auth/register ===== //

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !name.trim() ||
      !email.trim() ||
      !password
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Name, email and password are required." });
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide a valid email." });
    }

    if (trimmedName.length > 100) {
      return res
        .status(400)
        .json({ success: false, message: "Name cannot exceed 100 characters." });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: "Password must be at least 6 characters." });
    }

    const allowedRoles = ["student", "alumni"];
    const assignedRole = allowedRoles.includes(role) ? role : "student";

    const exists = await User.findOne({ email: trimmedEmail });
    if (exists) {
      return res
        .status(409)
        .json({ success: false, message: "An account with this email already exists." });
    }

    const user = await User.create({
      name: trimmedName,
      email: trimmedEmail,
      password,
      role: assignedRole,
    });
    const token = signToken(user._id);

    res.status(201).json({ success: true, token, user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
};

// ====== POST /api/auth/login ====== //

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required." });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // ===== Include password for comparison ====== //
    const user = await User.findOne({ email: trimmedEmail }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });
    }

    const token = signToken(user._id);
    res.json({ success: true, token, user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
};

// ===== GET /api/auth/me ====== //

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    res.json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
};

// ===== PUT /api/auth/profile ====== //

exports.updateProfile = async (req, res, next) => {
  try {
    const { name, batch, domain, company, bio, avatarUrl } = req.body;

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return res.status(400).json({ success: false, message: "Name cannot be empty." });
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (batch !== undefined) updates.batch = typeof batch === "string" && batch.trim() ? batch.trim() : null;
    if (domain !== undefined) updates.domain = typeof domain === "string" && domain.trim() ? domain.trim() : null;
    if (company !== undefined) updates.company = typeof company === "string" && company.trim() ? company.trim() : null;
    if (bio !== undefined) updates.bio = typeof bio === "string" && bio.trim() ? bio.trim() : null;
    if (avatarUrl !== undefined) updates.avatarUrl = typeof avatarUrl === "string" && avatarUrl.trim() ? avatarUrl.trim() : null;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    res.json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
};

const jwt = require("jsonwebtoken");
const User = require("../models/User");

/* ====== protect — verifies JWT and attaches req.user ====== */
exports.protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required. Please sign in." });
    }

    const token = auth.split(" ")[1];
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, message: "JWT secret is not configured on server." });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "User no longer exists." });
    }

    req.user = user;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token. Please sign in again." });
  }
};

/**
 * authorize — role-based access control
 * Usage: authorize("admin") or authorize("admin", "alumni")
 */
exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required role: ${roles.join(" or ")}. Your role: ${req.user.role}.`,
    });
  }
  next();
};

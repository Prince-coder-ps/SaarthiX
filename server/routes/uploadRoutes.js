const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const { uploadAvatar, deleteAvatar } = require("../controllers/uploadController");
const { avatarUpload } = require("../middleware/uploadMiddleware");
const { protect } = require("../middleware/authMiddleware");

// Limit per LOGGED-IN USER (not per IP, so a whole campus on one Wi-Fi does not share a quota)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => String(req.user._id),
  message: { success: false, message: "Too many photo changes. Please try again in a few minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

router.use(protect);

router.post("/avatar", uploadLimiter, avatarUpload, uploadAvatar);
router.delete("/avatar", uploadLimiter, deleteAvatar);

module.exports = router;
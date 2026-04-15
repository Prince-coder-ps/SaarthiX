const router = require("express").Router();
const {
  getAllUsers,
  getStats,
  verifyAlumni,
  deleteUser,
} = require("../controllers/adminController");
const { protect, authorize } = require("../middleware/authMiddleware");

// All admin routes require authentication + admin role
router.use(protect, authorize("admin"));

router.get("/users", getAllUsers);
router.get("/stats", getStats);
router.patch("/verify/:userId", verifyAlumni);
router.delete("/users/:userId", deleteUser);

module.exports = router;

const router = require("express").Router();
const {
  sendRequest,
  getStudentRequests,
  getAlumniRequests,
  updateStatus,
  getAlumniList,
} = require("../controllers/mentorshipController");
const { protect } = require("../middleware/authMiddleware");

// All mentorship routes require authentication
router.use(protect);

router.get("/alumni-list", getAlumniList);
router.post("/request", sendRequest);
router.get("/student", getStudentRequests);
router.get("/alumni", getAlumniRequests);
router.patch("/:id/status", updateStatus);

module.exports = router;

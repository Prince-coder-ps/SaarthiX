const router = require("express").Router();
const {
  createSession,
  getSessionByRequest,
  updateSessionStatus,
} = require("../controllers/sessionController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.post("/", createSession);
router.get("/:requestId", getSessionByRequest);
router.patch("/:id/status", updateSessionStatus);

module.exports = router;

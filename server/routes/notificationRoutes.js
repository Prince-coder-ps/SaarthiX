const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { getNotifications, markRead, markAllRead } = require("../controllers/notificationController");

router.use(protect);

router.get("/", getNotifications);
router.patch("/read-all", markAllRead);
router.patch("/:id/read", markRead);

module.exports = router;

const mongoose = require("mongoose");
const Notification = require("../models/Notification");

// Every query below is scoped by req.user._id (from the verified JWT) — never by a client-sent userId.

// ===== GET /api/notifications?limit=20&unread=true ===== //
exports.getNotifications = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const filter = { userId: req.user._id };
    if (req.query.unread === "true") filter.isRead = false;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit),
      Notification.countDocuments({ userId: req.user._id, isRead: false }),
    ]);

    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    next(err);
  }
};

// ===== PATCH /api/notifications/read-all ===== //
exports.markAllRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ success: true, updated: result.modifiedCount, unreadCount: 0 });
  } catch (err) {
    next(err);
  }
};

// ===== PATCH /api/notifications/:id/read ===== //
exports.markRead = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid notification ID." });
    }

    // Ownership is part of the query: someone else's notification simply "does not exist" for you.
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { isRead: true } },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    const unreadCount = await Notification.countDocuments({ userId: req.user._id, isRead: false });
    res.json({ success: true, notification, unreadCount });
  } catch (err) {
    next(err);
  }
};

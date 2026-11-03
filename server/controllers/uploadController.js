const User = require("../models/User");
const { getCloudinary } = require("../config/cloudinary");
const { detectImageType } = require("../middleware/uploadMiddleware");
const { sanitizeUser } = require("./authController");

// One avatar per user. The id comes from the logged-in user — never from the request —
// so nobody can overwrite or delete somebody else's picture.
const avatarPublicId = (userId) => `saarthix/avatars/user_${userId}`;

/* ===== POST /api/upload/avatar ===== */
exports.uploadAvatar = async (req, res, next) => {
  try {
    const cloudinary = getCloudinary();
    if (!cloudinary) {
      return res
        .status(503)
        .json({ success: false, message: "Image uploads are not configured on the server." });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Please choose an image to upload." });
    }
    if (!detectImageType(req.file.buffer)) {
      return res.status(400).json({ success: false, message: "That file is not a valid image." });
    }

    let result;
    try {
      result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: avatarPublicId(req.user._id),
            overwrite: true,          // replace the previous photo
            invalidate: true,         // purge the CDN copy of the old one
            resource_type: "image",
            allowed_formats: ["jpg", "jpeg", "png", "webp"],
            // Stored as a 400x400 square, centred on the face/subject, optimised
            transformation: [
              { width: 400, height: 400, crop: "fill", gravity: "auto" },
              { quality: "auto", fetch_format: "auto" },
            ],
          },
          (err, uploaded) => (err ? reject(err) : resolve(uploaded))
        );
        stream.end(req.file.buffer);
      });
    } catch (cloudErr) {
      console.error("[Cloudinary] upload failed:", cloudErr.message || cloudErr);
      return res
        .status(502)
        .json({ success: false, message: "Could not upload the image. Please try again." });
    }

    // secure_url contains a version number that changes on every upload,
    // so browsers never show a stale cached photo.
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatarUrl: result.secure_url },
      { new: true }
    );

    res.json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
};

/* ===== DELETE /api/upload/avatar ===== */
exports.deleteAvatar = async (req, res, next) => {
  try {
    if (!req.user.avatarUrl) {
      return res.json({ success: true, user: sanitizeUser(req.user) }); // nothing to remove
    }

    const cloudinary = getCloudinary();
    if (cloudinary) {
      try {
        await cloudinary.uploader.destroy(avatarPublicId(req.user._id), { invalidate: true });
      } catch (cloudErr) {
        // Not fatal — we still clear the link so the app stops showing it.
        console.error("[Cloudinary] destroy failed:", cloudErr.message || cloudErr);
      }
    }

    const user = await User.findByIdAndUpdate(req.user._id, { avatarUrl: null }, { new: true });
    res.json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
};
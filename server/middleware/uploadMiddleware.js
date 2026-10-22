const multer = require("multer");

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

// Keep the file in memory (we stream it straight to Cloudinary — nothing is written to disk,
// which matters on hosts like Render where the disk is temporary).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
    const err = new Error("Only JPG, PNG or WebP images are allowed.");
    err.status = 400;
    cb(err);
  },
});

/** Accepts ONE file in the form field "avatar" and turns multer errors into clean 400s. */
exports.avatarUpload = (req, res, next) => {
  upload.single("avatar")(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Image must be 2 MB or smaller."
          : err.code === "LIMIT_UNEXPECTED_FILE"
          ? 'Upload the image in the "avatar" field.'
          : err.message;
      return res.status(400).json({ success: false, message });
    }
    return next(err); // fileFilter error (status 400) or anything unexpected
  });
};

/**
 * Check the real file signature ("magic bytes") — the browser-supplied mimetype can be faked.
 * Returns "jpeg" | "png" | "webp" or null.
 */
exports.detectImageType = (buf) => {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
};

exports.MAX_AVATAR_BYTES = MAX_AVATAR_BYTES;
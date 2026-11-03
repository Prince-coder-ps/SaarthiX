const { v2: cloudinary } = require("cloudinary");

let configured = false;

/**
 * Returns the configured Cloudinary client, or null when the three CLOUDINARY_*
 * environment variables are missing (so the rest of the API keeps working).
 * Configured lazily so it always sees the values loaded from .env / the host.
 */
const getCloudinary = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return null;

  if (!configured) {
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
};

module.exports = { getCloudinary };
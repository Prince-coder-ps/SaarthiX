import { useEffect, useState } from "react";

/**
 * Round profile picture.
 *  - shows the photo (`src`) when there is one
 *  - falls back to the first letter of `name` when there is no photo OR the image fails to load
 *
 * <Avatar src={user.avatarUrl} name={user.name} size={40} />
 */
export default function Avatar({ src, name = "", size = 40, className = "" }) {
  const [failed, setFailed] = useState(false);

  // If the photo changes (new upload), try loading it again
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const initial = (name || "U").trim().charAt(0).toUpperCase() || "U";
  const box = { width: size, height: size, minWidth: size };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name ? `${name}'s profile photo` : "Profile photo"}
        style={box}
        className={`rounded-full object-cover shrink-0 bg-muted ${className}`}
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      style={{ ...box, fontSize: Math.max(11, Math.round(size * 0.4)) }}
      className={`rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0 select-none ${className}`}
      aria-label={name || "User"}
    >
      {initial}
    </div>
  );
}

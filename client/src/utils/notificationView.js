/**
 * Pure helpers for the notification bell (no imports, so `node --test` can run them).
 */

/** Badge text: nothing for 0, "9+" above 9. */
export function formatBadge(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  return n > 9 ? "9+" : String(n);
}

/** "just now", "5 min ago", "2 h ago", "3 d ago", else a short date. */
export function timeAgo(iso, now = Date.now()) {
  const t = new Date(iso).getTime();
  if (!iso || Number.isNaN(t)) return "";
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Where a notification should take the user: their own dashboard (where the request/session card lives). */
export function getNotificationTarget(notification, role) {
  if (!notification) return null;
  if (role === "alumni") return "/alumni-dashboard";
  if (role === "student") return "/student-dashboard";
  return null;
}

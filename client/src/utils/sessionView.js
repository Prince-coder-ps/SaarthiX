/**
 * Pure helpers for showing a mentorship session on request cards / modals.
 * No imports on purpose, so they can be unit-tested with plain `node --test`.
 *
 * Data shape (from the API):  request.session = { id, scheduledAt (ISO/UTC), timezone, meetLink, status, ... }
 */

/** Frontend check is UX / defence-in-depth only — the backend is the real validator. */
export function isSafeHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".");
  } catch {
    return false;
  }
}

const clean = (s) => s.replace(/[\u202f\u00a0]/g, " "); // ICU puts a narrow no-break space before AM/PM

const isValidDate = (iso) => !!iso && !Number.isNaN(new Date(iso).getTime());

/** "5 October 2026" — in the viewer's local zone unless `timeZone` is given. */
export function formatSessionDate(iso, timeZone) {
  if (!isValidDate(iso)) return null;
  return clean(
    new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone }).format(new Date(iso))
  );
}

/** "5:00 PM" */
export function formatSessionTime(iso, timeZone) {
  if (!isValidDate(iso)) return null;
  return clean(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(new Date(iso))
  );
}

/** Separate date / time for the details modal (falls back to legacy strings, then "—"). */
export function getSessionDateTimeParts(session, timeZone) {
  const date = formatSessionDate(session?.scheduledAt, timeZone) || session?.date || "—";
  const time = formatSessionTime(session?.scheduledAt, timeZone) || session?.time || "—";
  return { date, time };
}

/** "5 October 2026 • 5:00 PM" */
export function formatSessionWhen(session, timeZone) {
  const d = formatSessionDate(session?.scheduledAt, timeZone);
  const t = formatSessionTime(session?.scheduledAt, timeZone);
  if (d && t) return `${d} • ${t}`;
  if (session?.date) return [session.date, session.time].filter(Boolean).join(" • ");
  return "Time not set";
}

/**
 * What a request card should show.
 *  - info: only while BOTH the request and its session are "scheduled"
 *  - meet: additionally needs a safe https meetLink
 * pending / accepted / rejected / cancelled / completed → nothing.
 */
export function getSessionCardState(request) {
  const session = request?.session;
  const active = request?.status === "scheduled" && session?.status === "scheduled";
  return {
    showInfo: !!active,
    showMeet: !!active && isSafeHttpsUrl(session.meetLink),
  };
}

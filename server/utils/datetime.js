/**
 * Date/time helpers for sessions.
 *
 * Source of truth is a UTC instant (Mongo Date). Local "date + time" input is converted
 * using an IANA time zone via the built-in Intl API (no extra dependency, DST-safe,
 * works for any zone — not hardcoded to IST).
 */
const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
// ISO-8601 with an explicit offset (Z or ±hh:mm) — offset-less strings are ambiguous.
const ISO_WITH_OFFSET_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

const isValidTimeZone = (tz) => {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const pad = (n) => String(n).padStart(2, "0");

// Wall-clock fields of an instant in a given zone
const zonedParts = (utcMs, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
};

// Offset (ms) of `timeZone` from UTC at the given instant
const offsetMs = (utcMs, timeZone) => {
  const p = zonedParts(utcMs, timeZone);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(utcMs / 1000) * 1000;
};

/**
 * Convert a wall-clock date ("YYYY-MM-DD") + time ("HH:mm") in `timeZone` to a UTC Date.
 * Returns null for malformed input or a wall-clock time that doesn't exist in that zone.
 */
const zonedToUtc = (dateStr, timeStr, timeZone = DEFAULT_TIMEZONE) => {
  const dm = DATE_RE.exec(String(dateStr || "").trim());
  const tm = TIME_RE.exec(String(timeStr || "").trim());
  if (!dm || !tm || !isValidTimeZone(timeZone)) return null;

  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null; // e.g. 2026-02-31

  let ts = wall - offsetMs(wall, timeZone);
  ts = wall - offsetMs(ts, timeZone); // re-evaluate at the candidate instant (DST boundaries)

  const back = zonedParts(ts, timeZone);
  if (back.y !== y || back.mo !== mo || back.d !== d || back.h !== h || back.mi !== mi) return null; // skipped by DST
  return new Date(ts);
};

/**
 * Work out the session instant from request input.
 * Accepts either `scheduledAt` (ISO with offset) or legacy-style `date` + `time` (+ optional `timeZone`).
 * @returns {{ok:true, scheduledAt:Date, timezone:string} | {ok:false, message:string}}
 */
const resolveScheduledAt = ({ scheduledAt, date, time, timeZone } = {}) => {
  if (timeZone !== undefined && timeZone !== null && timeZone !== "" && !isValidTimeZone(timeZone)) {
    return { ok: false, message: "timeZone must be a valid IANA time zone (e.g. Asia/Kolkata)." };
  }
  const tz = timeZone ? timeZone : DEFAULT_TIMEZONE;

  let when;
  if (scheduledAt !== undefined && scheduledAt !== null && scheduledAt !== "") {
    if (typeof scheduledAt !== "string" || !ISO_WITH_OFFSET_RE.test(scheduledAt.trim())) {
      return { ok: false, message: "scheduledAt must be an ISO-8601 date-time with a time zone offset (e.g. 2026-10-05T17:00:00+05:30)." };
    }
    when = new Date(scheduledAt.trim());
  } else {
    if (typeof date !== "string" || typeof time !== "string" || !date.trim() || !time.trim()) {
      return { ok: false, message: "Provide scheduledAt, or both date (YYYY-MM-DD) and time (HH:mm)." };
    }
    when = zonedToUtc(date, time, tz);
  }

  if (!when || Number.isNaN(when.getTime())) {
    return { ok: false, message: "Invalid session date/time." };
  }
  if (when.getTime() <= Date.now()) {
    return { ok: false, message: "Session time must be in the future." };
  }
  return { ok: true, scheduledAt: when, timezone: tz };
};

module.exports = { DEFAULT_TIMEZONE, isValidTimeZone, zonedToUtc, resolveScheduledAt };

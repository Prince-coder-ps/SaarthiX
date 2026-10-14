/**
 * Meet link validation (backend is the security boundary; frontend checks are UX only).
 * Accepts ONLY absolute https:// URLs with a real hostname and no embedded credentials.
 * Rejects javascript:, data:, file:, http:, blob:, ftp:, etc.
 */
const MAX_LENGTH = 2048;

/**
 * @returns {{ok:true, value:string|null} | {ok:false, message:string}}
 *   value is null when no link was supplied (the link is optional).
 */
const validateMeetLink = (input) => {
  if (input === undefined || input === null) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, message: "meetLink must be a string." };

  const raw = input.trim();
  if (!raw) return { ok: true, value: null };

  const bad = (message) => ({ ok: false, message });
  if (raw.length > MAX_LENGTH) return bad(`meetLink cannot exceed ${MAX_LENGTH} characters.`);
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) return bad("meetLink must not contain spaces or control characters.");

  let url;
  try {
    url = new URL(raw);
  } catch {
    return bad("meetLink must be a valid URL.");
  }
  if (url.protocol !== "https:") return bad("meetLink must be a valid https:// URL.");
  if (url.username || url.password) return bad("meetLink must not contain embedded credentials.");
  if (!url.hostname.includes(".")) return bad("meetLink must point to a public hostname.");

  return { ok: true, value: url.href };
};

const isSafeMeetLink = (input) => {
  const r = validateMeetLink(input);
  return r.ok && r.value !== null;
};

module.exports = { validateMeetLink, isSafeMeetLink };

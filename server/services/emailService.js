/**
 * Email service (Nodemailer / SMTP). Controllers and schedulers never talk to SMTP directly.
 *
 * Env: EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE, EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM
 *  - NODE_ENV=test        → never touches the network (JSON transport)
 *  - not configured, dev  → logs "not sent" and succeeds (so local development works without SMTP)
 *  - not configured, prod → throws, so the reminder is retried / flagged instead of silently "sent"
 */
const nodemailer = require("nodemailer");
const { DEFAULT_TIMEZONE, isValidTimeZone } = require("../utils/datetime");
const { isSafeMeetLink } = require("../utils/meetLink");

const EMAIL_RE = /^\S+@\S+\.\S+$/;

let transporter = null;

const isConfigured = () =>
  !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);

const getTransporter = () => {
  if (transporter) return transporter;

  if (process.env.NODE_ENV === "test") {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  } else if (isConfigured()) {
    const port = Number(process.env.EMAIL_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port,
      secure: process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE === "true" : port === 465,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
    });
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("Email is not configured (set EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD).");
  } else {
    console.warn("[Email] Not configured — emails are logged, NOT sent (dev mode).");
    transporter = nodemailer.createTransport({ jsonTransport: true });
    transporter.__devOnly = true;
  }
  return transporter;
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const minutesText = (n) => (n === 1 ? "1 minute" : `${n} minutes`);
const minutesN = (n) => String(n);

const zoneLabel = (tz) => (tz === "Asia/Kolkata" ? "IST" : tz);

/** Date/time shown in the zone the session was scheduled in (never the server's zone). */
const formatWhen = (scheduledAt, timezone) => {
  const tz = isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const at = new Date(scheduledAt);
  const clean = (s) => s.replace(/[\u202f\u00a0]/g, " ");
  return {
    date: clean(new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: tz }).format(at)),
    time: clean(new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(at)),
    zone: zoneLabel(tz),
  };
};

/** Pure: builds subject / text / html. All interpolated values are escaped in the HTML. */
const buildSessionReminderEmail = ({ recipientName, otherName, role, scheduledAt, timezone, meetLink, minutesLeft = 30 }) => {
  const { date, time, zone } = formatWhen(scheduledAt, timezone);
  const left = minutesText(minutesLeft);
  const hasLink = isSafeMeetLink(meetLink);
  const noLinkText =
    role === "alumni"
      ? "You have not added a meeting link for this session yet. Please add one from your SaarthiX dashboard."
      : "A meeting link has not been added yet. Please check your SaarthiX dashboard.";

  const subject = `Mentorship Session Reminder — Starting in ${minutesN(minutesLeft)} ${minutesLeft === 1 ? "Minute" : "Minutes"}`;

  const text = [
    `Hi ${recipientName},`,
    "",
    `Your mentorship session with ${otherName} starts in ${left}.`,
    "",
    `Date: ${date}`,
    `Time: ${time} (${zone})`,
    "",
    hasLink ? `Join the session:\n${meetLink}` : noLinkText,
    "",
    "— Team SaarthiX",
  ].join("\n");

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937;line-height:1.5">
  <p>Hi ${escapeHtml(recipientName)},</p>
  <p>Your mentorship session with <strong>${escapeHtml(otherName)}</strong> starts in <strong>${escapeHtml(left)}</strong>.</p>
  <p>
    <strong>Date:</strong> ${escapeHtml(date)}<br/>
    <strong>Time:</strong> ${escapeHtml(time)} (${escapeHtml(zone)})
  </p>
  ${
    hasLink
      ? `<p><a href="${escapeHtml(meetLink)}" style="background:#6d28d9;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Join the session</a></p>
  <p style="font-size:13px;color:#6b7280">Or open: ${escapeHtml(meetLink)}</p>`
      : `<p>${escapeHtml(noLinkText)}</p>`
  }
  <p style="color:#6b7280">— Team SaarthiX</p>
</div>`.trim();

  return { subject, text, html };
};

/**
 * Sends one reminder email. Throws on invalid recipient or provider failure
 * (the reminder processor catches this per recipient).
 */
const sendSessionReminderEmail = async ({ to, ...details }) => {
  if (typeof to !== "string" || !EMAIL_RE.test(to.trim())) {
    throw new Error("Recipient email is missing or invalid.");
  }
  const { subject, text, html } = buildSessionReminderEmail(details);
  const transport = getTransporter();
  const from =
    process.env.EMAIL_FROM ||
    (process.env.EMAIL_USER ? `SaarthiX <${process.env.EMAIL_USER}>` : "SaarthiX <no-reply@saarthix.local>");

  const info = await transport.sendMail({ from, to: to.trim(), subject, text, html });
  if (transport.__devOnly) console.log(`[Email] (dev mode, not sent) "${subject}"`);
  return info;
};

const _resetTransporterForTests = () => { transporter = null; };

module.exports = { sendSessionReminderEmail, buildSessionReminderEmail, formatWhen, isConfigured, _resetTransporterForTests };

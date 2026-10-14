// Run with:  npm test   (uses Node's built-in test runner — no extra dependency)
import test from "node:test";
import assert from "node:assert/strict";
import {
  isSafeHttpsUrl, getSessionCardState, formatSessionWhen, formatSessionDate, formatSessionTime, getSessionDateTimeParts,
} from "../src/utils/sessionView.js";

const LINK = "https://meet.google.com/abc-defg-hij";
const when = "2026-10-05T11:30:00.000Z"; // 5 Oct 2026, 17:00 IST
const card = (status, session) => ({ _id: "r1", status, session });
const session = (over = {}) => ({ id: "s1", scheduledAt: when, meetLink: LINK, status: "scheduled", ...over });

test("scheduled request with a valid session shows info AND the Meet button", () => {
  assert.deepEqual(getSessionCardState(card("scheduled", session())), { showInfo: true, showMeet: true });
});

test("pending request does not show a Meet button (session is null)", () => {
  assert.deepEqual(getSessionCardState(card("pending", null)), { showInfo: false, showMeet: false });
  // even if a session object were somehow present
  assert.equal(getSessionCardState(card("pending", session())).showMeet, false);
});

test("accepted / rejected requests do not show a Meet button", () => {
  for (const status of ["accepted", "rejected"]) {
    assert.deepEqual(getSessionCardState(card(status, null)), { showInfo: false, showMeet: false });
  }
});

test("cancelled session / cancelled request does not show a Meet button", () => {
  assert.equal(getSessionCardState(card("scheduled", session({ status: "cancelled" }))).showMeet, false);
  assert.equal(getSessionCardState(card("cancelled", session({ status: "cancelled" }))).showMeet, false);
  assert.equal(getSessionCardState(card("cancelled", null)).showInfo, false);
});

test("completed session: no card-level info or Meet button (existing behaviour: Details modal only)", () => {
  assert.deepEqual(getSessionCardState(card("completed", session({ status: "completed" }))), { showInfo: false, showMeet: false });
});

test("scheduled but no link → info shown, no Meet button", () => {
  assert.deepEqual(getSessionCardState(card("scheduled", session({ meetLink: null }))), { showInfo: true, showMeet: false });
});

test("unsafe links never produce a Meet button", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "http://meet.google.com/x",
    "https://u:p@meet.google.com/x", "//evil.com", "", "   ", null, undefined, 42]) {
    assert.equal(isSafeHttpsUrl(bad), false, String(bad));
    assert.equal(getSessionCardState(card("scheduled", session({ meetLink: bad }))).showMeet, false, String(bad));
  }
  assert.equal(isSafeHttpsUrl(LINK), true);
});

test("date/time formatting matches the spec example (Asia/Kolkata)", () => {
  assert.equal(formatSessionDate(when, "Asia/Kolkata"), "5 October 2026");
  assert.equal(formatSessionTime(when, "Asia/Kolkata"), "5:00 PM");
  assert.equal(formatSessionWhen(session(), "Asia/Kolkata"), "5 October 2026 • 5:00 PM");
});

test("the same instant renders in the viewer's own zone (UTC source of truth)", () => {
  assert.equal(formatSessionTime(when, "UTC"), "11:30 AM");
  assert.equal(formatSessionTime(when, "America/New_York"), "7:30 AM");
});

test("legacy sessions without scheduledAt fall back to the old strings, then to a placeholder", () => {
  assert.equal(formatSessionWhen({ date: "2026-10-05", time: "17:00" }), "2026-10-05 • 17:00");
  assert.deepEqual(getSessionDateTimeParts({ date: "2026-10-05", time: "17:00" }), { date: "2026-10-05", time: "17:00" });
  assert.equal(formatSessionWhen({}), "Time not set");
  assert.deepEqual(getSessionDateTimeParts({ scheduledAt: "garbage" }), { date: "—", time: "—" });
});

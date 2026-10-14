import test from "node:test";
import assert from "node:assert/strict";
import { formatBadge, timeAgo, getNotificationTarget } from "../src/utils/notificationView.js";

test("badge: hidden for 0/invalid, number up to 9, '9+' above", () => {
  assert.equal(formatBadge(0), "");
  assert.equal(formatBadge(undefined), "");
  assert.equal(formatBadge(-3), "");
  assert.equal(formatBadge(2), "2");
  assert.equal(formatBadge(9), "9");
  assert.equal(formatBadge(10), "9+");
});

test("timeAgo", () => {
  const now = new Date("2026-10-05T12:00:00Z").getTime();
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.equal(timeAgo(ago(10 * 1000), now), "just now");
  assert.equal(timeAgo(ago(5 * 60000), now), "5 min ago");
  assert.equal(timeAgo(ago(3 * 3600000), now), "3 h ago");
  assert.equal(timeAgo(ago(2 * 86400000), now), "2 d ago");
  assert.equal(timeAgo("garbage", now), "");
  assert.equal(timeAgo(undefined, now), "");
});

test("a clicked notification goes to the user's own dashboard", () => {
  assert.equal(getNotificationTarget({ _id: "n1" }, "student"), "/student-dashboard");
  assert.equal(getNotificationTarget({ _id: "n1" }, "alumni"), "/alumni-dashboard");
  assert.equal(getNotificationTarget({ _id: "n1" }, "admin"), null);
  assert.equal(getNotificationTarget(null, "student"), null);
});

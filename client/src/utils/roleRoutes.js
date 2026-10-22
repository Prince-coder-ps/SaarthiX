/**
 * Central place for role → route decisions.
 * Used by the Navbar (after login), PublicRoute (already-logged-in visitors) and anywhere
 * else that needs to know "where should this user land?".
 */

/** Page a user lands on right after logging in / signing up. */
export const getPostLoginPath = (role) => {
  if (role === "admin") return "/admin";
  return "/feed"; // students & alumni keep landing on the community feed
};

/** The user's own dashboard. */
export const getDashboardPath = (role) => {
  if (role === "admin") return "/admin";
  if (role === "alumni") return "/alumni-dashboard";
  return "/student-dashboard";
};
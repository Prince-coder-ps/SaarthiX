import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getPostLoginPath } from "../utils/roleRoutes";
import Loader from "./Loader";

/**
 * Wraps public-only routes (landing page, signup stubs).
 * Logged-in users are sent to their role's home page
 * (admin → /admin, student/alumni → /feed).
 */
export default function PublicRoute({ children }) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Loader fullScreen />;
  if (isAuthenticated)
    return <Navigate to={getPostLoginPath(user?.role)} replace />;
  return children;
}

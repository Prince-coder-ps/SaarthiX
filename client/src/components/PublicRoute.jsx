import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "./Loader";

/**
 * Wraps public-only routes (landing page, signup stubs).
 * Logged-in users are sent straight to /feed.
 */
export default function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Loader fullScreen />;
  if (isAuthenticated) return <Navigate to="/feed" replace />;
  return children;
}

import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "./Loader";

/**
 * ProtectedRoute — guards private routes based on authentication & optional role restrictions.
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <Loader fullScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    // Redirect to the user's appropriate default dashboard
    if (user?.role === "alumni") return <Navigate to="/alumni-dashboard" replace />;
    if (user?.role === "admin") return <Navigate to="/admin" replace />;
    return <Navigate to="/student-dashboard" replace />;
  }

  return children;
}

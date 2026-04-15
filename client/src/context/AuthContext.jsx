import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authAPI } from "../services/api";

const AuthContext = createContext(null);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const loadUserFromStorage = () => {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const persistSession = (token, user) => {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
};

const clearSession = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
};

// ─────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(loadUserFromStorage);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: verify stored token is still valid
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setIsLoading(false);
      return;
    }
    authAPI
      .getMe()
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
      })
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // ── signUp ─────────────────────────────────────────────────
  const signUp = useCallback(async (email, password, name, role) => {
    try {
      const { data } = await authAPI.register({ name, email, password, role });
      persistSession(data.token, data.user);
      setUser(data.user);
      return { error: null };
    } catch (err) {
      return {
        error: new Error(
          err.response?.data?.message || "Registration failed. Please try again."
        ),
      };
    }
  }, []);

  // ── signIn ─────────────────────────────────────────────────
  const signIn = useCallback(async (email, password) => {
    try {
      const { data } = await authAPI.login({ email, password });
      persistSession(data.token, data.user);
      setUser(data.user);
      return { error: null };
    } catch (err) {
      return {
        error: new Error(
          err.response?.data?.message || "Invalid email or password."
        ),
      };
    }
  }, []);

  // ── signOut ────────────────────────────────────────────────
  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  // ── refreshProfile ─────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    try {
      const { data } = await authAPI.getMe();
      setUser(data.user);
      localStorage.setItem("user", JSON.stringify(data.user));
    } catch {
      // silently fail — token interceptor handles 401
    }
  }, []);

  const value = {
    user,
    profile: user,          // alias — existing components use both
    isAuthenticated: !!user,
    isLoading,
    signUp,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};

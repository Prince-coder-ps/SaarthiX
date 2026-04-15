import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// ── Attach JWT to every outgoing request ──────────────────────
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Auto-logout on 401 ────────────────────────────────────────
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

// ════════════════════════════════════════════════════════════════
// Auth
// ════════════════════════════════════════════════════════════════
export const authAPI = {
  register: (data) => API.post("/auth/register", data),
  login: (data) => API.post("/auth/login", data),
  getMe: () => API.get("/auth/me"),
  updateProfile: (data) => API.put("/auth/profile", data),
};

// ════════════════════════════════════════════════════════════════
// Mentorship
// ════════════════════════════════════════════════════════════════
export const mentorshipAPI = {
  getAlumniList: (params) => API.get("/mentorship/alumni-list", { params }),
  sendRequest: (data) => API.post("/mentorship/request", data),
  getStudentRequests: () => API.get("/mentorship/student"),
  getAlumniRequests: () => API.get("/mentorship/alumni"),
  updateStatus: (id, status) =>
    API.patch(`/mentorship/${id}/status`, { status }),
};

// ════════════════════════════════════════════════════════════════
// Sessions
// ════════════════════════════════════════════════════════════════
export const sessionAPI = {
  create: (data) => API.post("/sessions", data),
  getByRequest: (requestId) => API.get(`/sessions/${requestId}`),
  updateStatus: (id, status) =>
    API.patch(`/sessions/${id}/status`, { status }),
};

// ════════════════════════════════════════════════════════════════
// Admin
// ════════════════════════════════════════════════════════════════
export const adminAPI = {
  getUsers: (params) => API.get("/admin/users", { params }),
  getStats: () => API.get("/admin/stats"),
  verifyAlumni: (userId, verify) =>
    API.patch(`/admin/verify/${userId}`, { verify }),
  deleteUser: (userId) => API.delete(`/admin/users/${userId}`),
};

export default API;

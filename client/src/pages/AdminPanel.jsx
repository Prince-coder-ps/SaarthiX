import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Users,
  UserCheck,
  Activity,
  ShieldCheck,
  CheckCircle,
  Trash2,
  Loader2,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { adminAPI } from "../services/api";
import { formatDate } from "../utils/helpers";
import Navbar from "../components/Navbar";
import Loader from "../components/Loader";

const PAGE_SIZE = 8;
const FETCH_LIMIT = 100; // backend caps /admin/users at 100 per request

// ─────────────────────────────────────────────────────────────
// Small reusable pieces
// ─────────────────────────────────────────────────────────────
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && !loading && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={() => !loading && onCancel()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-card rounded-xl shadow-xl p-6 w-full max-w-sm animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
              danger
                ? "bg-red-50 text-destructive"
                : "bg-yellow-50 text-yellow-600"
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{message}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            className="btn-outline text-sm px-4 py-2"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 text-sm px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 ${
              danger
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const ROLE_BADGE = {
  admin: "bg-purple-100 text-purple-800 border-purple-300",
  alumni: "bg-blue-100 text-blue-800 border-blue-300",
  student: "bg-gray-100 text-gray-700 border-gray-300",
};

function RoleBadge({ role }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border capitalize ${ROLE_BADGE[role] || ""}`}
    >
      {role}
    </span>
  );
}

function StatusBadge({ u }) {
  if (u.role === "alumni") {
    return (
      <span
        className={`text-xs px-2 py-0.5 rounded-full border ${
          u.isVerified
            ? "bg-green-50 text-green-700 border-green-200"
            : "bg-yellow-50 text-yellow-700 border-yellow-200"
        }`}
      >
        {u.isVerified ? "Verified" : "Pending"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      Active
    </span>
  );
}

function SkeletonRows({ rows = 4, cols = 6 }) {
  return Array.from({ length: rows }).map((_, r) => (
    <tr key={r} className="border-b border-border/50">
      {Array.from({ length: cols }).map((__, c) => (
        <td key={c} className="py-3 pr-4">
          <div
            className="h-4 rounded bg-muted animate-pulse"
            style={{ width: c === 0 ? "70%" : "50%" }}
          />
        </td>
      ))}
    </tr>
  ));
}

// ─────────────────────────────────────────────────────────────
// Admin Panel
// ─────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();

  // filters / pagination / confirm dialog
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); // all | student | alumni | admin
  const [statusFilter, setStatusFilter] = useState("all"); // all | verified | pending (alumni only)
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null); // { type: "delete" | "revoke", target }

  const queueRef = useRef(null);
  const usersRef = useRef(null);

  const isAdmin = !!user && user.role === "admin";

  // ========= Data fetching ========= //
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: () =>
      adminAPI.getUsers({ limit: FETCH_LIMIT }).then((r) => r.data.users),
  });

  const { data: stats = {} } = useQuery({
    queryKey: ["admin-stats"],
    enabled: isAdmin,
    queryFn: () => adminAPI.getStats().then((r) => r.data.stats),
  });

  // ======= Mutations ======== //
  const verifyMutation = useMutation({
    mutationFn: ({ userId, verify }) => adminAPI.verifyAlumni(userId, verify),
    onSuccess: (_, { verify }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success(verify ? "Alumni verified!" : "Verification revoked.");
    },
    onError: (err) => toast.error(err.response?.data?.message || "Failed."),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId) => adminAPI.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("User deleted.");
    },
    onError: (err) =>
      toast.error(err.response?.data?.message || "Failed to delete."),
  });

  // which row is currently being updated (to show a spinner on just that row)
  const busyId = verifyMutation.isPending
    ? verifyMutation.variables?.userId
    : deleteMutation.isPending
      ? deleteMutation.variables
      : null;

  const confirmLoading =
    deleteMutation.isPending ||
    (verifyMutation.isPending && confirm?.type === "revoke");

  const runConfirm = () => {
    if (!confirm) return;
    const { type, target } = confirm;
    if (type === "delete") {
      deleteMutation.mutate(target._id, { onSettled: () => setConfirm(null) });
    } else {
      verifyMutation.mutate(
        { userId: target._id, verify: false },
        { onSettled: () => setConfirm(null) },
      );
    }
  };

  // ======== Derived data ========= //
  const unverified = useMemo(
    () => users.filter((u) => u.role === "alumni" && !u.isVerified),
    [users],
  );

  const counts = useMemo(
    () => ({
      all: users.length,
      student: users.filter((u) => u.role === "student").length,
      alumni: users.filter((u) => u.role === "alumni").length,
      admin: users.filter((u) => u.role === "admin").length,
    }),
    [users],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (roleFilter === "alumni") {
        if (statusFilter === "verified" && !u.isVerified) return false;
        if (statusFilter === "pending" && u.isVerified) return false;
      }
      if (q) {
        const hay = `${u.name || ""} ${u.email || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const firstShown = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(safePage * PAGE_SIZE, filtered.length);

  const filtersActive = search.trim() !== "" || roleFilter !== "all";

  // ======== Filter helpers ========= //
  const changeRole = (r) => {
    setRoleFilter(r);
    setStatusFilter("all");
    setPage(1);
  };
  const changeStatus = (s) => {
    setStatusFilter(s);
    setPage(1);
  };
  const changeSearch = (v) => {
    setSearch(v);
    setPage(1);
  };
  const clearFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    setPage(1);
  };

  const scrollTo = (ref) =>
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // ======== Guards (after all hooks) ========= //
  if (isLoading) return <Loader fullScreen />;
  if (!isAuthenticated || user?.role !== "admin")
    return <Navigate to="/" replace />;

  // ======== Stat cards (clickable ones jump to the relevant section) ========= //
  const statCards = [
    {
      icon: Users,
      label: "Total Users",
      value: stats.totalUsers ?? 0,
      color: "text-primary",
      bg: "bg-primary/10",
      onClick: () => {
        clearFilters();
        scrollTo(usersRef);
      },
    },
    {
      icon: UserCheck,
      label: "Verified Alumni",
      value: stats.verifiedAlumni ?? 0,
      color: "text-green-600",
      bg: "bg-green-50",
      onClick: () => {
        setSearch("");
        setRoleFilter("alumni");
        setStatusFilter("verified");
        setPage(1);
        scrollTo(usersRef);
      },
    },
    {
      icon: ShieldCheck,
      label: "Pending Verifications",
      value: stats.pendingVerifications ?? 0,
      color: "text-yellow-600",
      bg: "bg-yellow-50",
      onClick: () => scrollTo(queueRef),
    },
    {
      icon: Activity,
      label: "Mentorship Requests",
      value: stats.totalRequests ?? 0,
      color: "text-blue-600",
      bg: "bg-blue-50",
      onClick: null, // no dedicated page yet
    },
  ];

  const roleTabs = [
    { key: "all", label: "All" },
    { key: "student", label: "Students" },
    { key: "alumni", label: "Alumni" },
    { key: "admin", label: "Admins" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage users, verify alumni, and monitor platform activity.
          </p>
        </div>

        {/* ========== Stats ========= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {statCards.map((c) => {
            const inner = (
              <>
                <div
                  className={`h-11 w-11 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}
                >
                  <c.icon className={`h-5 w-5 ${c.color}`} />
                </div>
                <div className="text-left">
                  <p className="text-2xl font-bold">{c.value}</p>
                  <p className="text-sm text-muted-foreground">{c.label}</p>
                </div>
              </>
            );
            return c.onClick ? (
              <button
                key={c.label}
                type="button"
                onClick={c.onClick}
                className="dashboard-card flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {inner}
              </button>
            ) : (
              <div
                key={c.label}
                className="dashboard-card flex items-center gap-4"
              >
                {inner}
              </div>
            );
          })}
        </div>

        {/* ========= Verification Queue ======== */}
        <div ref={queueRef} className="dashboard-card mb-8 scroll-mt-24">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Alumni Verification Queue</h2>
            {unverified.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
                {unverified.length} pending
              </span>
            )}
          </div>

          {usersLoading ? (
            <Loader />
          ) : unverified.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                All alumni are verified. You're all caught up!
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {[
                      "Name",
                      "Email",
                      "Batch",
                      "Company",
                      "Domain",
                      "Joined",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="pb-3 pr-4 font-medium text-muted-foreground whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unverified.map((v) => {
                    const busy = busyId === v._id;
                    return (
                      <tr
                        key={v._id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 pr-4 font-medium">
                          {v.name || "—"}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground text-xs">
                          {v.email}
                        </td>
                        <td className="py-3 pr-4">{v.batch || "—"}</td>
                        <td className="py-3 pr-4">{v.company || "—"}</td>
                        <td className="py-3 pr-4">{v.domain || "—"}</td>
                        <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                          {formatDate(v.createdAt)}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1"
                              onClick={() =>
                                verifyMutation.mutate({
                                  userId: v._id,
                                  verify: true,
                                })
                              }
                              disabled={
                                verifyMutation.isPending ||
                                deleteMutation.isPending
                              }
                            >
                              {busy && verifyMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle className="h-3 w-3" />
                              )}
                              Approve
                            </button>
                            <button
                              className="text-xs py-1 px-2 text-destructive border border-destructive/30 rounded-md hover:bg-destructive/5 transition-colors disabled:opacity-50"
                              onClick={() =>
                                setConfirm({ type: "delete", target: v })
                              }
                              disabled={
                                verifyMutation.isPending ||
                                deleteMutation.isPending
                              }
                              title="Delete user"
                              aria-label={`Delete ${v.name || "user"}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ======== All Users ======== */}
        <div ref={usersRef} className="dashboard-card scroll-mt-24">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h2 className="font-semibold">All Users</h2>
            <span className="text-xs text-muted-foreground">
              {counts.student} students · {counts.alumni} alumni ·{" "}
              {counts.admin} admin
            </span>
          </div>

          {/* Search + filters */}
          <div className="flex flex-col gap-3 mb-4">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => changeSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full pl-9 pr-9 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => changeSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {roleTabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => changeRole(t.key)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    roleFilter === t.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t.label}{" "}
                  <span className="opacity-70">({counts[t.key]})</span>
                </button>
              ))}

              {roleFilter === "alumni" && (
                <>
                  <span className="h-4 w-px bg-border mx-1" />
                  {[
                    { key: "all", label: "Any status" },
                    { key: "verified", label: "Verified" },
                    { key: "pending", label: "Pending" },
                  ].map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => changeStatus(s.key)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        statusFilter === s.key
                          ? "bg-foreground text-background border-foreground"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </>
              )}

              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs text-primary hover:underline ml-auto"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-border text-left">
                  {["User", "Role", "Status", "Batch", "Joined", "Actions"].map(
                    (h) => (
                      <th
                        key={h}
                        className="pb-3 pr-4 font-medium text-muted-foreground"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <SkeletonRows rows={4} cols={6} />
                ) : pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center">
                      <Users className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {users.length === 0
                          ? "No users yet."
                          : "No users match your filters."}
                      </p>
                      {filtersActive && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-sm text-primary hover:underline mt-2"
                        >
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  pageItems.map((u) => {
                    const isSelf = u._id === user.id;
                    const busy = busyId === u._id;
                    return (
                      <tr
                        key={u._id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
                              {(u.name || "U").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium">
                                {u.name || "—"}
                                {isSelf && (
                                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground align-middle">
                                    You
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {u.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <RoleBadge role={u.role} />
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge u={u} />
                        </td>
                        <td className="py-3 pr-4">{u.batch || "—"}</td>
                        <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                          {formatDate(u.createdAt)}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            {u.role === "alumni" && !u.isVerified && (
                              <button
                                className="inline-flex items-center gap-1 text-xs text-green-700 border border-green-200 rounded px-2 py-1 hover:bg-green-50 transition-colors disabled:opacity-50"
                                onClick={() =>
                                  verifyMutation.mutate({
                                    userId: u._id,
                                    verify: true,
                                  })
                                }
                                disabled={
                                  verifyMutation.isPending ||
                                  deleteMutation.isPending
                                }
                              >
                                {busy && verifyMutation.isPending && (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                )}
                                Verify
                              </button>
                            )}
                            {u.role === "alumni" && u.isVerified && (
                              <button
                                className="text-xs text-yellow-700 border border-yellow-200 rounded px-2 py-1 hover:bg-yellow-50 transition-colors disabled:opacity-50"
                                onClick={() =>
                                  setConfirm({ type: "revoke", target: u })
                                }
                                disabled={
                                  verifyMutation.isPending ||
                                  deleteMutation.isPending
                                }
                              >
                                Revoke
                              </button>
                            )}
                            {u.role !== "admin" && (
                              <button
                                className="text-xs text-destructive border border-destructive/30 rounded px-2 py-1 hover:bg-destructive/5 transition-colors disabled:opacity-50"
                                onClick={() =>
                                  setConfirm({ type: "delete", target: u })
                                }
                                disabled={
                                  verifyMutation.isPending ||
                                  deleteMutation.isPending
                                }
                                title="Delete user"
                                aria-label={`Delete ${u.name || "user"}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                            {u.role === "admin" && (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!usersLoading && filtered.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                Showing {firstShown}–{lastShown} of {filtered.length}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(safePage - 1)}
                    disabled={safePage === 1}
                    className="btn-outline text-xs px-2.5 py-1.5 gap-1"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(safePage + 1)}
                    disabled={safePage === totalPages}
                    className="btn-outline text-xs px-2.5 py-1.5 gap-1"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {!usersLoading && (stats.totalUsers ?? 0) > users.length && (
            <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2 mt-4">
              Showing the latest {users.length} of {stats.totalUsers} users.
              Older accounts will appear here once server-side search is added.
            </p>
          )}
        </div>
      </div>

      {/* ======= Confirm dialog (delete / revoke) ======= */}
      <ConfirmDialog
        open={!!confirm}
        danger={confirm?.type === "delete"}
        loading={confirmLoading}
        title={
          confirm?.type === "delete"
            ? `Delete ${confirm?.target?.name || "this user"}?`
            : `Revoke verification for ${confirm?.target?.name || "this alumni"}?`
        }
        message={
          confirm?.type === "delete"
            ? "This permanently removes the account along with their mentorship requests, sessions, notifications and posts. This cannot be undone."
            : "They will go back to the verification queue and won't be listed for students until you verify them again."
        }
        confirmLabel={confirm?.type === "delete" ? "Delete user" : "Revoke"}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

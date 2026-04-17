import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Users, UserCheck, Activity, ShieldCheck,
  CheckCircle, Trash2, Loader2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { adminAPI } from "../services/api";
import Navbar from "../components/Navbar";
import Loader from "../components/Loader";

export default function AdminPanel() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  // ========= Data fetching ========= //
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    enabled: !!user && user.role === "admin",
    queryFn: () => adminAPI.getUsers().then((r) => r.data.users),
  });

  const { data: stats = {} } = useQuery({
    queryKey: ["admin-stats"],
    enabled: !!user && user.role === "admin",
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
    onError: (err) => toast.error(err.response?.data?.message || "Failed to delete."),
  });

  const handleDelete = (userId, name) => {
    if (window.confirm(`Delete user "${name}"? This cannot be undone.`)) {
      deleteMutation.mutate(userId);
    }
  };

  // ======== Guards ========= //
  if (isLoading) return <Loader fullScreen />;
  if (!isAuthenticated || user?.role !== "admin") {
    navigate("/");
    return null;
  }

  const unverified = users.filter((u) => u.role === "alumni" && !u.isVerified);
  const allAlumni  = users.filter((u) => u.role === "alumni" && u.isVerified);
  const students   = users.filter((u) => u.role === "student");

  const roleBadge = (role) => {
    const map = {
      admin:   "bg-purple-100 text-purple-800 border-purple-300",
      alumni:  "bg-blue-100   text-blue-800   border-blue-300",
      student: "bg-gray-100   text-gray-700   border-gray-300",
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${map[role] || ""}`}>
        {role}
      </span>
    );
  };

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
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Users,       label: "Total Users",           value: stats.totalUsers           ?? 0, color: "text-primary",    bg: "bg-primary/10"    },
            { icon: UserCheck,   label: "Verified Alumni",        value: stats.verifiedAlumni       ?? 0, color: "text-green-600",  bg: "bg-green-50"      },
            { icon: ShieldCheck, label: "Pending Verifications",  value: stats.pendingVerifications ?? 0, color: "text-yellow-600", bg: "bg-yellow-50"     },
            { icon: Activity,    label: "Total Requests",         value: stats.totalRequests        ?? 0, color: "text-blue-600",   bg: "bg-blue-50"       },
          ].map((c) => (
            <div key={c.label} className="dashboard-card flex items-center gap-4">
              <div className={`h-11 w-11 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
                <c.icon className={`h-5 w-5 ${c.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-sm text-muted-foreground">{c.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ========= Verification Queue ======== */}
        <div className="dashboard-card mb-8">
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
                    {["Name", "Email", "Batch", "Company", "Domain", "Joined", "Actions"].map((h) => (
                      <th key={h} className="pb-3 pr-4 font-medium text-muted-foreground whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unverified.map((v) => (
                    <tr key={v._id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4 font-medium">{v.name || "—"}</td>
                      <td className="py-3 pr-4 text-muted-foreground text-xs">{v.email}</td>
                      <td className="py-3 pr-4">{v.batch || "—"}</td>
                      <td className="py-3 pr-4">{v.company || "—"}</td>
                      <td className="py-3 pr-4">{v.domain || "—"}</td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                        {new Date(v.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1 disabled:opacity-50"
                            onClick={() => verifyMutation.mutate({ userId: v._id, verify: true })}
                            disabled={verifyMutation.isPending}
                          >
                            <CheckCircle className="h-3 w-3" /> Approve
                          </button>
                          <button
                            className="text-xs py-1 px-2 text-destructive border border-destructive/30 rounded-md hover:bg-destructive/5 transition-colors disabled:opacity-50"
                            onClick={() => handleDelete(v._id, v.name)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ======== All Users ======== */}
        <div className="dashboard-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">All Users</h2>
            <span className="text-xs text-muted-foreground">
              {students.length} students · {allAlumni.length} verified alumni
            </span>
          </div>

          {usersLoading ? (
            <Loader />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["User", "Role", "Status", "Batch", "Joined", "Actions"].map((h) => (
                      <th key={h} className="pb-3 pr-4 font-medium text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
                            {(u.name || "U").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">{u.name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">{roleBadge(u.role)}</td>
                      <td className="py-3 pr-4">
                        {u.role === "alumni" ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${
                            u.isVerified
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-yellow-50 text-yellow-700 border-yellow-200"
                          }`}>
                            {u.isVerified ? "Verified" : "Pending"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">{u.batch || "—"}</td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          {u.role === "alumni" && !u.isVerified && (
                            <button
                              className="text-xs text-green-700 border border-green-200 rounded px-2 py-1 hover:bg-green-50 transition-colors"
                              onClick={() => verifyMutation.mutate({ userId: u._id, verify: true })}
                              disabled={verifyMutation.isPending}
                            >
                              Verify
                            </button>
                          )}
                          {u.role === "alumni" && u.isVerified && (
                            <button
                              className="text-xs text-yellow-700 border border-yellow-200 rounded px-2 py-1 hover:bg-yellow-50 transition-colors"
                              onClick={() => verifyMutation.mutate({ userId: u._id, verify: false })}
                              disabled={verifyMutation.isPending}
                            >
                              Revoke
                            </button>
                          )}
                          {u.role !== "admin" && (
                            <button
                              className="text-xs text-destructive border border-destructive/30 rounded px-2 py-1 hover:bg-destructive/5 transition-colors"
                              onClick={() => handleDelete(u._id, u.name)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

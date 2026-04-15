import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Inbox, CalendarDays, History,
  CheckCircle, XCircle, Loader2,
  Calendar, Clock, X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { mentorshipAPI, sessionAPI } from "../services/api";
import Navbar from "../components/Navbar";
import StatusBadge from "../components/StatusBadge";
import Loader from "../components/Loader";

// ── Schedule Session Modal ──────────────────────────────────
function ScheduleModal({ request, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    try {
      await sessionAPI.create({
        requestId: request._id,
        date:      fd.get("date"),
        time:      fd.get("time"),
        notes:     fd.get("notes"),
        meetLink:  fd.get("meetLink"),
      });
      toast.success("Session scheduled!");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to schedule session.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl shadow-xl p-6 w-full max-w-md animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Schedule Session</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Scheduling with <span className="font-medium text-foreground">{request.studentId?.name}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Date</label>
              <input
                name="date" type="date" required
                min={new Date().toISOString().split("T")[0]}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Time</label>
              <input
                name="time" type="time" required
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Meet Link (optional)</label>
            <input
              name="meetLink" type="url" placeholder="https://meet.google.com/..."
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Notes (optional)</label>
            <textarea
              name="notes" rows={3}
              placeholder="Topics to discuss, preparation tips…"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <button
            type="submit" disabled={submitting}
            className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm Session
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────
export default function AlumniDashboard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const [scheduleFor, setScheduleFor] = useState(null);

  const { data: requests = [], isLoading: reqLoading } = useQuery({
    queryKey: ["alumni-requests"],
    enabled: !!user,
    queryFn: () => mentorshipAPI.getAlumniRequests().then((r) => r.data.requests),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => mentorshipAPI.updateStatus(id, status),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["alumni-requests"] });
      toast.success(
        status === "accepted" ? "Request accepted!" :
        status === "rejected" ? "Request declined." :
        "Status updated!"
      );
    },
    onError: (err) => toast.error(err.response?.data?.message || "Failed to update."),
  });

  if (isLoading) return <Loader fullScreen />;
  if (!isAuthenticated) { navigate("/"); return null; }

  const pending   = requests.filter((r) => r.status === "pending");
  const accepted  = requests.filter((r) => r.status === "accepted");   // awaiting schedule
  const upcoming  = requests.filter((r) => r.status === "scheduled");
  const completed = requests.filter((r) => r.status === "completed");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      {scheduleFor && (
        <ScheduleModal
          request={scheduleFor}
          onClose={() => setScheduleFor(null)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["alumni-requests"] })}
        />
      )}

      <div className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Alumni Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Hello, {user.name} 👋 — manage your mentorship sessions.
          </p>
        </div>

        {/* ── Stats ───────────────────────────────────────── */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Inbox,        label: "Pending",   value: pending.length,   color: "text-yellow-600", bg: "bg-yellow-50"  },
            { icon: CheckCircle,  label: "Accepted",  value: accepted.length,  color: "text-blue-600",   bg: "bg-blue-50"    },
            { icon: CalendarDays, label: "Scheduled", value: upcoming.length,  color: "text-purple-600", bg: "bg-purple-50"  },
            { icon: History,      label: "Completed", value: completed.length, color: "text-green-600",  bg: "bg-green-50"   },
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

        {/* ── Pending Requests ────────────────────────────── */}
        <div className="dashboard-card mb-8">
          <h2 className="font-semibold mb-4">
            Incoming Requests
            {pending.length > 0 && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
                {pending.length} new
              </span>
            )}
          </h2>

          {reqLoading ? (
            <Loader />
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No pending requests at the moment.
            </p>
          ) : (
            <div className="space-y-4">
              {pending.map((r) => (
                <div
                  key={r._id}
                  className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-background border border-border gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-semibold shrink-0">
                      {(r.studentId?.name || "S").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{r.studentId?.name || "Student"}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.studentId?.domain || "—"} • Batch {r.studentId?.batch || "—"}
                      </p>
                      {r.message && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          "{r.message}"
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1 disabled:opacity-50"
                      onClick={() => updateStatus.mutate({ id: r._id, status: "accepted" })}
                      disabled={updateStatus.isPending}
                    >
                      <CheckCircle className="h-3.5 w-3.5" /> Accept
                    </button>
                    <button
                      className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1 text-destructive border-destructive/30 hover:bg-destructive/5 disabled:opacity-50"
                      onClick={() => updateStatus.mutate({ id: r._id, status: "rejected" })}
                      disabled={updateStatus.isPending}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Accepted — awaiting schedule ────────────────── */}
        {accepted.length > 0 && (
          <div className="dashboard-card mb-8">
            <h2 className="font-semibold mb-4">Accepted — Schedule a Session</h2>
            <div className="space-y-3">
              {accepted.map((r) => (
                <div
                  key={r._id}
                  className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-blue-50 border border-blue-200 gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                      {(r.studentId?.name || "S").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{r.studentId?.name}</p>
                      <p className="text-xs text-muted-foreground">{r.studentId?.batch || "—"}</p>
                    </div>
                  </div>
                  <button
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                    onClick={() => setScheduleFor(r)}
                  >
                    <Calendar className="h-3.5 w-3.5" /> Schedule Session
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Upcoming + Completed ─────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="dashboard-card">
            <h2 className="font-semibold mb-4">Upcoming Sessions</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No upcoming sessions.
              </p>
            ) : (
              <div className="space-y-3">
                {upcoming.map((r) => (
                  <div
                    key={r._id}
                    className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
                  >
                    <div>
                      <p className="font-medium text-sm">{r.studentId?.name || "Student"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      <button
                        className="text-xs text-green-700 border border-green-200 bg-green-50 rounded px-2 py-1 hover:bg-green-100 transition-colors"
                        onClick={() => updateStatus.mutate({ id: r._id, status: "completed" })}
                      >
                        Mark Done
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="dashboard-card">
            <h2 className="font-semibold mb-4">Completed Sessions</h2>
            {completed.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No completed sessions yet.
              </p>
            ) : (
              <div className="space-y-3">
                {completed.map((r) => (
                  <div
                    key={r._id}
                    className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
                  >
                    <div>
                      <p className="font-medium text-sm">{r.studentId?.name || "Student"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

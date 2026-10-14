import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock, CheckCircle, Send, Search,
  CalendarDays, Loader2, GraduationCap,
  Calendar, Video, X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { mentorshipAPI, sessionAPI } from "../services/api";
import Navbar from "../components/Navbar";
import StatusBadge from "../components/StatusBadge";
import Loader from "../components/Loader";
import SessionInfo from "../components/SessionInfo";
import { getSessionDateTimeParts, isSafeHttpsUrl } from "../utils/sessionView";

const REJECTION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches backend

function SessionModal({ requestId, onClose }) {
  const { data: session, isLoading, error } = useQuery({
    queryKey: ["session", requestId],
    queryFn: () => sessionAPI.getByRequest(requestId).then((res) => res.data.session),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-xl p-6 w-full max-w-md animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" /> Session Details
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <Loader />
        ) : error || !session ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Session details not available.</p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 bg-muted/40 p-3 rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="font-medium">{getSessionDateTimeParts(session).date}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Time</p>
                <p className="font-medium">{getSessionDateTimeParts(session).time}</p>
              </div>
            </div>

            {session.status === "scheduled" && (
              isSafeHttpsUrl(session.meetLink) ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Meeting Link</p>
                  <a
                    href={session.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary text-xs py-2 px-3 flex items-center justify-center gap-2 w-full"
                  >
                    <Video className="h-4 w-4" /> Join Meeting
                  </a>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No meeting link provided yet.</p>
              )
            )}

            {session.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1 font-medium">Notes / Agenda</p>
                <p className="p-3 bg-background border border-border rounded-md text-xs whitespace-pre-wrap">{session.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate   = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch]   = useState("");
  const [domain, setDomain]   = useState("");
  const [sentIds, setSentIds] = useState(new Set()); // optimistic tracking
  const [selectedSessionRequestId, setSelectedSessionRequestId] = useState(null);

  // ======= Fetch student's own requests ========= //
  const { data: requests = [], isLoading: reqLoading } = useQuery({
    queryKey: ["student-requests"],
    enabled: !!user,
    queryFn: () => mentorshipAPI.getStudentRequests().then((r) => r.data.requests),
  });

  // ====== Fetch verified alumni list =======
  const { data: alumniList = [], isLoading: alumniLoading } = useQuery({
    queryKey: ["alumni-list", search, domain],
    enabled: !!user,
    queryFn: () =>
      mentorshipAPI
        .getAlumniList({ search: search || undefined, domain: domain || undefined })
        .then((r) => r.data.alumni),
  });

  // ========= Already-requested alumni IDs (from real data) ======== //
  // pending/accepted/scheduled/completed always block a new request.
  // rejected blocks only until the 7-day cooldown passes; cancelled never blocks.
  const now = new Date();
  const requestedAlumniIds = new Set(
    requests
      .filter((r) => {
        if (["pending", "accepted", "scheduled", "completed"].includes(r.status)) return true;
        if (r.status === "rejected") {
          if (!r.rejectedAt) return false;
          const cooldownEndsAt = new Date(new Date(r.rejectedAt).getTime() + REJECTION_COOLDOWN_MS);
          return cooldownEndsAt > now;
        }
        return false; // cancelled
      })
      .map((r) => r.alumniId?._id || r.alumniId)
  );

  // ======== Send mentorship request ========= //
  const sendRequest = useMutation({
    mutationFn: (alumniId) =>
      mentorshipAPI.sendRequest({
        alumniId,
        message: "I would love to connect for mentorship guidance.",
      }),
    onMutate: (alumniId) => {
      setSentIds((s) => new Set([...s, alumniId]));
    },
    onSuccess: () => {
      toast.success("Mentorship request sent!");
      queryClient.invalidateQueries({ queryKey: ["student-requests"] });
    },
    onError: (err, alumniId) => {
      setSentIds((s) => { const n = new Set(s); n.delete(alumniId); return n; });
      toast.error(err.response?.data?.message || "Failed to send request.");
    },
  });

  // ======== Cancel a pending request ========= //
  const cancelRequest = useMutation({
    mutationFn: (requestId) => mentorshipAPI.updateStatus(requestId, "cancelled"),
    onSuccess: () => {
      toast.success("Request cancelled.");
      queryClient.invalidateQueries({ queryKey: ["student-requests"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Failed to cancel request.");
    },
  });

  // ======= Guards ==========
  if (isLoading) return <Loader fullScreen />;
  if (!isAuthenticated) { navigate("/"); return null; }

  // ======= Counts =========
  const pendingCount   = requests.filter((r) => r.status === "pending").length;
  const scheduledCount = requests.filter((r) => r.status === "scheduled").length;
  const completedCount = requests.filter((r) => r.status === "completed").length;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      {selectedSessionRequestId && (
        <SessionModal
          requestId={selectedSessionRequestId}
          onClose={() => setSelectedSessionRequestId(null)}
        />
      )}

      <div className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Student Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Hello, {user?.name || "Student"} 👋 — find your mentor and grow your career.
          </p>
        </div>

        {/* ======= Stats ======= */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {[
            { icon: Clock,        label: "Pending Requests",   value: pendingCount,   color: "text-yellow-600", bg: "bg-yellow-50"  },
            { icon: CalendarDays, label: "Upcoming Sessions",  value: scheduledCount, color: "text-blue-600",   bg: "bg-blue-50"    },
            { icon: CheckCircle,  label: "Completed Sessions", value: completedCount, color: "text-green-600",  bg: "bg-green-50"   },
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

        {/* ======= My Requests ======== */}
        <div className="dashboard-card mb-8">
          <h2 className="font-semibold mb-4">My Mentorship Requests</h2>

          {reqLoading ? (
            <Loader />
          ) : requests.length === 0 ? (
            <div className="text-center py-10">
              <GraduationCap className="h-10 w-10 text-muted mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No requests yet. Search for alumni below to get started!
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {requests.map((r) => {
                  const alumniId = r.alumniId?._id || r.alumniId;
                  const cooldownEndsAt =
                    r.status === "rejected" && r.rejectedAt
                      ? new Date(new Date(r.rejectedAt).getTime() + REJECTION_COOLDOWN_MS)
                      : null;
                  const cooldownActive = cooldownEndsAt && cooldownEndsAt > now;

                  return (
                    <div
                      key={r._id}
                      className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-background border border-border gap-3"
                    >
                      <div className="flex items-center gap-3">
                        {r.alumniId?.avatarUrl ? (
                          <img
                            src={r.alumniId.avatarUrl}
                            alt={r.alumniId?.name || "Alumni"}
                            className="h-9 w-9 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold shrink-0">
                            {(r.alumniId?.name || "A").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm">{r.alumniId?.name || "Alumni"}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.alumniId?.domain || "—"} • {r.alumniId?.company || "—"}
                          </p>
                          <div className="mt-2"><SessionInfo request={r} /></div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          Sent {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                        <StatusBadge status={r.status} />

                        {/* Session details view for scheduled and completed sessions */}
                        {(r.status === "scheduled" || r.status === "completed") && (
                          <button
                            className="text-xs px-2.5 py-1 rounded-md border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-colors flex items-center gap-1 font-medium"
                            onClick={() => setSelectedSessionRequestId(r._id)}
                          >
                            <Video className="h-3.5 w-3.5" /> Session Details
                          </button>
                        )}

                        {/* Relevant action per card */}
                        {r.status === "pending" && (
                          <button
                            className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                            disabled={cancelRequest.isPending}
                            onClick={() => {
                              if (window.confirm(`Cancel your request to ${r.alumniId?.name || "this alumni"}?`)) {
                                cancelRequest.mutate(r._id);
                              }
                            }}
                          >
                            Cancel
                          </button>
                        )}

                        {r.status === "cancelled" && alumniId && (
                          <button
                            className="text-xs px-2.5 py-1 rounded-md btn-primary disabled:opacity-50"
                            disabled={sendRequest.isPending}
                            onClick={() => sendRequest.mutate(alumniId)}
                          >
                            Request Again
                          </button>
                        )}

                        {r.status === "rejected" && cooldownActive && (
                          <span className="text-xs text-muted-foreground">
                            Retry after {cooldownEndsAt.toLocaleDateString()}
                          </span>
                        )}

                        {r.status === "rejected" && !cooldownActive && alumniId && (
                          <button
                            className="text-xs px-2.5 py-1 rounded-md btn-primary disabled:opacity-50"
                            disabled={sendRequest.isPending}
                            onClick={() => sendRequest.mutate(alumniId)}
                          >
                            Request Again
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ======= Alumni Search ======== */}
        <div className="dashboard-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h2 className="font-semibold">Find Alumni Mentors</h2>
            <span className="text-xs text-muted-foreground">
              {alumniList.length} verified alumni found
            </span>
          </div>

          {/* Search & filter */}
          <div className="flex flex-col md:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                className="w-full pl-9 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Search by name, domain, company…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            >
              <option value="">All Domains</option>
              <option value="ai">AI / ML</option>
              <option value="web">Web Dev</option>
              <option value="product">Product</option>
              <option value="design">Design</option>
              <option value="data">Data Science</option>
              <option value="mobile">Mobile</option>
              <option value="devops">DevOps</option>
            </select>
          </div>

          {alumniLoading ? (
            <Loader />
          ) : alumniList.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-muted-foreground">
                No verified alumni found. Try a different search.
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {alumniList.map((a) => {
                const alreadySent =
                  requestedAlumniIds.has(a._id) || sentIds.has(a._id);
                return (
                  <div
                    key={a._id}
                    className="p-4 rounded-lg border border-border hover:shadow-md transition-shadow bg-background"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-semibold shrink-0">
                        {(a.name || "A").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{a.name || "Alumni"}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.company || "—"} • Batch {a.batch || "—"}
                        </p>
                      </div>
                    </div>
                    {a.bio && (
                      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{a.bio}</p>
                    )}
                    <p className="text-xs text-muted-foreground mb-3">
                      <span className="font-medium">Domain:</span> {a.domain || "—"}
                    </p>
                    <button
                      className={`w-full text-sm py-1.5 rounded-md flex items-center justify-center gap-1.5 font-medium transition-all ${
                        alreadySent
                          ? "bg-green-50 text-green-700 border border-green-200 cursor-default"
                          : "btn-primary disabled:opacity-50"
                      }`}
                      onClick={() => !alreadySent && sendRequest.mutate(a._id)}
                      disabled={alreadySent || sendRequest.isPending}
                    >
                      {alreadySent ? (
                        <>
                          <CheckCircle className="h-3.5 w-3.5" /> Request Sent
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" /> Request Mentorship
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

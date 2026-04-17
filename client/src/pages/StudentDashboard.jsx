import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock, CheckCircle, Send, Search,
  CalendarDays, Loader2, GraduationCap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { mentorshipAPI } from "../services/api";
import Navbar from "../components/Navbar";
import StatusBadge from "../components/StatusBadge";
import MentorshipStepper from "../components/MentorshipStepper";
import Loader from "../components/Loader";

export default function StudentDashboard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate   = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch]   = useState("");
  const [domain, setDomain]   = useState("");
  const [sentIds, setSentIds] = useState(new Set()); // optimistic tracking

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
  const requestedAlumniIds = new Set(
    requests.map((r) => r.alumniId?._id || r.alumniId)
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

  // ======= Guards ==========
  if (isLoading) return <Loader fullScreen />;
  if (!isAuthenticated) { navigate("/"); return null; }

  // ======= Counts =========
  const pendingCount   = requests.filter((r) => r.status === "pending").length;
  const scheduledCount = requests.filter((r) => r.status === "scheduled").length;
  const completedCount = requests.filter((r) => r.status === "completed").length;

  // Most recent request for the stepper
  const latestRequest = requests[0];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Student Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Hello, {user.name} 👋 — find your mentor and grow your career.
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
                {requests.map((r) => (
                  <div
                    key={r._id}
                    className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-background border border-border gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold shrink-0">
                        {(r.alumniId?.name || "A").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{r.alumniId?.name || "Alumni"}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.alumniId?.domain || "—"} • {r.alumniId?.company || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Progress stepper for latest request */}
              {latestRequest && (
                <div className="mt-6 pt-5 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-3">
                    Latest request progress
                  </p>
                  <MentorshipStepper currentStep={latestRequest.status} />
                </div>
              )}
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
                        {a.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{a.name}</p>
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

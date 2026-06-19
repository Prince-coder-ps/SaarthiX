import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { postsAPI } from "../services/api";
import Navbar from "../components/Navbar";

// ── Helpers ──────────────────────────────────────────────────
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const ROLE_COLORS = {
  alumni:  "bg-blue-100 text-blue-700",
  student: "bg-emerald-100 text-emerald-700",
  admin:   "bg-purple-100 text-purple-700",
};

// ── PostCard ─────────────────────────────────────────────────
function PostCard({ post }) {
  const initial = (post.userName || "U").charAt(0).toUpperCase();
  const roleColor = ROLE_COLORS[post.role] || "bg-muted text-muted-foreground";

  return (
    <div className="dashboard-card animate-fade-in">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="h-10 w-10 rounded-full hero-gradient flex items-center justify-center text-white font-bold text-sm shrink-0">
          {initial}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-sm">{post.userName}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${roleColor}`}>
              {post.role}
            </span>
            <span className="text-xs text-muted-foreground ml-auto shrink-0">
              {timeAgo(post.createdAt)}
            </span>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {post.content}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── FeedPage ─────────────────────────────────────────────────
export default function FeedPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  const [posts,       setPosts]       = useState([]);
  const [content,     setContent]     = useState("");
  const [fetching,    setFetching]    = useState(true);
  const [submitting,  setSubmitting]  = useState(false);

  // ── Guard ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/", { replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  // ── Fetch posts on mount ───────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    postsAPI
      .getAll()
      .then(({ data }) => setPosts(data.posts || []))
      .catch(() => toast.error("Failed to load posts."))
      .finally(() => setFetching(false));
  }, [isAuthenticated]);

  // ── Submit post ────────────────────────────────────────────
  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    setSubmitting(true);

    // Optimistic: prepend a temporary post
    const optimistic = {
      _id:       `temp-${Date.now()}`,
      userId:    user._id,
      userName:  user.name,
      role:      user.role,
      content:   trimmed,
      createdAt: new Date().toISOString(),
      _temp:     true,
    };
    setPosts((prev) => [optimistic, ...prev]);
    setContent("");

    try {
      const { data } = await postsAPI.create({ content: trimmed });
      // Replace temp post with real one
      setPosts((prev) =>
        prev.map((p) => (p._id === optimistic._id ? data.post : p))
      );
      toast.success("Post shared!");
    } catch (err) {
      // Revert optimistic update
      setPosts((prev) => prev.filter((p) => p._id !== optimistic._id));
      setContent(trimmed);
      toast.error(err.response?.data?.message || "Failed to create post.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
  };

  if (isLoading || !isAuthenticated) return null;

  const initial = (user.name || "U").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        {/* ── Page title ── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Community Feed</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Share updates, tips, and insights with the community.
          </p>
        </div>

        {/* ── Composer ── */}
        <div className="dashboard-card mb-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full hero-gradient flex items-center justify-center text-white font-bold text-sm shrink-0">
              {initial}
            </div>
            <div className="flex-1">
              <textarea
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                rows={3}
                placeholder="Start a post..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={submitting}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">
                  Ctrl + Enter to post
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!content.trim() || submitting}
                  className="btn-primary px-4 py-1.5 text-sm gap-1.5 disabled:opacity-50"
                >
                  {submitting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />}
                  Post
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Feed ── */}
        {fetching ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No posts yet — be the first to share something!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post._id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

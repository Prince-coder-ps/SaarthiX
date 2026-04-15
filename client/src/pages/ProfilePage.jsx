import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Mail, Loader2, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../services/api";
import Navbar from "../components/Navbar";
import Loader from "../components/Loader";

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  if (isLoading) return <Loader fullScreen />;
  if (!isAuthenticated) { navigate("/"); return null; }

  // Profile completion percentage
  const fields = [user.name, user.batch, user.domain, user.company, user.bio];
  const completionPct = Math.round((fields.filter(Boolean).length / fields.length) * 100);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await authAPI.updateProfile({
        name:    fd.get("name"),
        batch:   fd.get("batch")   || null,
        domain:  fd.get("domain")  || null,
        company: fd.get("company") || null,
        bio:     fd.get("bio")     || null,
      });
      await refreshProfile();
      toast.success("Profile updated successfully!");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="flex-1 container mx-auto px-4 py-8 max-w-2xl">

        {/* Avatar card */}
        <div className="dashboard-card text-center mb-6">
          <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold mx-auto mb-4">
            {(user.name || "U").charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-bold">{user.name || "User"}</h1>
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            <span className="inline-block px-3 py-1 rounded-full text-xs border border-border bg-muted text-muted-foreground capitalize">
              {user.role}
            </span>
            {user.isVerified && (
              <span className="inline-block px-3 py-1 rounded-full text-xs border border-green-300 bg-green-50 text-green-700">
                ✓ Verified
              </span>
            )}
          </div>

          {/* Completion bar */}
          <div className="mt-4 max-w-xs mx-auto">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Profile completion</span>
              <span>{completionPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            {completionPct < 100 && (
              <p className="text-xs text-muted-foreground mt-1 text-center">
                Complete your profile to be visible to more students.
              </p>
            )}
          </div>
        </div>

        {/* Edit form */}
        <form onSubmit={handleSave} className="dashboard-card space-y-5">
          <h2 className="font-semibold text-base">Edit Profile</h2>

          <div>
            <label className="text-sm font-medium block mb-1">
              Full Name <span className="text-destructive">*</span>
            </label>
            <input
              name="name"
              defaultValue={user.name || ""}
              required
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Your full name"
            />
          </div>

          {/* Email (read-only) */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-muted text-sm text-muted-foreground">
            <Mail className="h-4 w-4 shrink-0" />
            {user.email}
            <span className="ml-auto text-xs">(cannot change)</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">Batch / Year</label>
              <input
                name="batch"
                defaultValue={user.batch || ""}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="e.g. 2024"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Domain</label>
              <input
                name="domain"
                defaultValue={user.domain || ""}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="e.g. Computer Science"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Company / Organisation</label>
            <input
              name="company"
              defaultValue={user.company || ""}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Google, Infosys, Startup"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Bio</label>
            <textarea
              name="bio"
              defaultValue={user.bio || ""}
              rows={4}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Share a little about yourself, your journey, and what kind of mentorship you offer or seek…"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}

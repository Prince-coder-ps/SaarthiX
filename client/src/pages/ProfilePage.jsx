import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Mail, Loader2, ShieldCheck, Clock, Camera } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { authAPI, uploadAPI } from "../services/api";
import Navbar from "../components/Navbar";
import Avatar from "../components/Avatar";
import Loader from "../components/Loader";

// ─────────────────────────────────────────────────────────────
// Role-based profile configuration
// Each role sees only the fields that make sense for it.
// ─────────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  student: {
    heading: "Student Profile",
    hint: "Complete your profile so alumni know who they are mentoring.",
    completion: ["name", "batch", "domain", "bio"],
    fields: [
      { name: "batch",  label: "Batch / Passing Year", placeholder: "e.g. 2027", half: true },
      { name: "domain", label: "Branch / Course",      placeholder: "e.g. Computer Science", half: true },
      {
        name: "bio", label: "About Me", type: "textarea",
        placeholder: "Tell alumni about your interests, goals and the kind of guidance you are looking for…",
      },
    ],
  },
  alumni: {
    heading: "Alumni Profile",
    hint: "Complete your profile to be visible to more students.",
    completion: ["name", "batch", "domain", "company", "bio"],
    fields: [
      { name: "batch",   label: "Graduation Year",            placeholder: "e.g. 2020", half: true },
      { name: "domain",  label: "Domain / Expertise",         placeholder: "e.g. Software Engineering", half: true },
      { name: "company", label: "Current Company / Organisation", placeholder: "e.g. Google, Infosys, Startup" },
      {
        name: "bio", label: "About Me", type: "textarea",
        placeholder: "Share your journey and the kind of mentorship you offer…",
      },
    ],
  },
  admin: {
    heading: "Administrator",
    hint: "",
    completion: [],
    fields: [],
  },
};

const BIO_MAX = 500;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB — same limit as the server
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const INPUT_CLASS =
  "w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const buildValues = (user, fieldNames) => {
  const v = { name: user?.name || "" };
  fieldNames.forEach((f) => { v[f] = user?.[f] || ""; });
  return v;
};

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);

  // profile photo
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving]   = useState(false);
  const [preview, setPreview]     = useState(null); // local preview while uploading

  const config = ROLE_CONFIG[user?.role] || ROLE_CONFIG.student;
  const fieldNames = useMemo(() => config.fields.map((f) => f.name), [config]);

  const [values, setValues] = useState(() => buildValues(user, fieldNames));

  // Re-sync the form if a different account / role is loaded
  useEffect(() => {
    setValues(buildValues(user, fieldNames));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  // ======== Guards (after all hooks) ========= //
  if (isLoading) return <Loader fullScreen />;
  if (!isAuthenticated) return <Navigate to="/" replace />;

  const isAdmin   = user.role === "admin";
  const isAlumni  = user.role === "alumni";
  const nameOk    = values.name.trim().length > 0;

  // Live profile completion (updates while typing)
  const completionPct = config.completion.length
    ? Math.round(
        (config.completion.filter((k) => String(values[k] || "").trim()).length /
          config.completion.length) * 100
      )
    : 0;

  // Has anything changed compared to what is saved?
  const isDirty = ["name", ...fieldNames].some(
    (k) => String(values[k] || "").trim() !== String(user[k] || "").trim()
  );

  const setValue = (key, val) => setValues((prev) => ({ ...prev, [key]: val }));

  // ── Profile photo ────────────────────────────────────────
  const pickPhoto = () => fileRef.current?.click();

  const handleFilePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be chosen again later
    if (!file) return;

    if (!AVATAR_TYPES.includes(file.type)) {
      toast.error("Please choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("Image must be 2 MB or smaller.");
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);          // show the new photo straight away
    setUploading(true);
    try {
      await uploadAPI.uploadAvatar(file);
      await refreshProfile();
      toast.success("Profile photo updated!");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not upload the photo. Please try again.");
    } finally {
      setUploading(false);
      setPreview(null);
      URL.revokeObjectURL(localUrl);
    }
  };

  const handleRemovePhoto = async () => {
    setRemoving(true);
    try {
      await uploadAPI.removeAvatar();
      await refreshProfile();
      toast.success("Profile photo removed.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not remove the photo.");
    } finally {
      setRemoving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!nameOk) {
      toast.error("Name cannot be empty.");
      return;
    }
    setSaving(true);

    // Only send fields this role actually has
    const payload = { name: values.name.trim() };
    fieldNames.forEach((f) => { payload[f] = values[f].trim() || null; });

    try {
      await authAPI.updateProfile(payload);
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
          <div className="relative h-24 w-24 mx-auto mb-4">
            <Avatar src={preview || user.avatarUrl} name={user.name} size={96} />
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            )}
            <button
              type="button"
              onClick={pickPhoto}
              disabled={uploading || removing}
              className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-card border border-border shadow flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-50"
              aria-label="Change profile photo"
              title="Change photo"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFilePick}
            />
          </div>
          <h1 className="text-xl font-bold">{user.name || "User"}</h1>
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            <span className="inline-block px-3 py-1 rounded-full text-xs border border-border bg-muted text-muted-foreground capitalize">
              {user.role}
            </span>
            {isAlumni && user.isVerified && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border border-green-300 bg-green-50 text-green-700">
                <ShieldCheck className="h-3 w-3" /> Verified
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 mt-3 text-xs">
            <button
              type="button"
              onClick={pickPhoto}
              disabled={uploading || removing}
              className="text-primary hover:underline disabled:opacity-50"
            >
              {user.avatarUrl ? "Change photo" : "Upload photo"}
            </button>
            {user.avatarUrl && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={uploading || removing}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                {removing && <Loader2 className="h-3 w-3 animate-spin" />}
                Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">JPG, PNG or WebP · max 2 MB</p>

          {/* Admin: short description instead of a completion bar */}
          {isAdmin && (
            <p className="text-sm text-muted-foreground mt-4 max-w-sm mx-auto">
              Administrator account. You manage users, alumni verification and platform activity.
            </p>
          )}

          {/* Student / alumni: live completion bar */}
          {!isAdmin && (
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
                <p className="text-xs text-muted-foreground mt-1 text-center">{config.hint}</p>
              )}
            </div>
          )}
        </div>

        {/* Alumni waiting for verification */}
        {isAlumni && !user.isVerified && (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 mb-6">
            <Clock className="h-4 w-4 text-yellow-700 mt-0.5 shrink-0" />
            <p className="text-sm text-yellow-800">
              Your account is pending verification. Once an admin verifies you, students can find
              you and send mentorship requests.
            </p>
          </div>
        )}

        {/* Edit form */}
        <form onSubmit={handleSave} className="dashboard-card space-y-5">
          <h2 className="font-semibold text-base">{isAdmin ? "Account Details" : `Edit ${config.heading}`}</h2>

          <div>
            <label className="text-sm font-medium block mb-1">
              Full Name <span className="text-destructive">*</span>
            </label>
            <input
              value={values.name}
              onChange={(e) => setValue("name", e.target.value)}
              required
              maxLength={100}
              className={INPUT_CLASS}
              placeholder="Your full name"
            />
          </div>

          {/* Email (read-only) */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-muted text-sm text-muted-foreground">
            <Mail className="h-4 w-4 shrink-0" />
            <span className="truncate">{user.email}</span>
            <span className="ml-auto text-xs shrink-0">(cannot change)</span>
          </div>

          {/* Role-specific fields */}
          {config.fields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {config.fields.map((f) => (
                <div key={f.name} className={f.half ? "" : "sm:col-span-2"}>
                  <label className="text-sm font-medium block mb-1">{f.label}</label>
                  {f.type === "textarea" ? (
                    <>
                      <textarea
                        value={values[f.name]}
                        onChange={(e) => setValue(f.name, e.target.value)}
                        rows={4}
                        maxLength={BIO_MAX}
                        className={`${INPUT_CLASS} resize-none`}
                        placeholder={f.placeholder}
                      />
                      <p className="text-xs text-muted-foreground text-right mt-1">
                        {values[f.name].length}/{BIO_MAX}
                      </p>
                    </>
                  ) : (
                    <input
                      value={values[f.name]}
                      onChange={(e) => setValue(f.name, e.target.value)}
                      className={INPUT_CLASS}
                      placeholder={f.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !isDirty || !nameOk}
            className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : isDirty ? "Save Changes" : "No changes to save"}
          </button>
        </form>
      </div>
    </div>
  );
}
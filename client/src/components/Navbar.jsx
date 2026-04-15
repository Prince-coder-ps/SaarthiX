import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  GraduationCap,
  User,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import logo from "/logo.png";

// ─── tiny helpers ────────────────────────────────────────────
function Modal({ open, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        ref={ref}
        className="bg-card rounded-xl shadow-xl p-6 w-full max-w-sm relative animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

function Input({ type = "text", ...props }) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="relative">
      <input
        type={isPassword && show ? "text" : type}
        {...props}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring pr-9"
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Navbar
// ─────────────────────────────────────────────────────────────
export default function Navbar() {
  const { user, isAuthenticated, isLoading, signIn, signUp, signOut } = useAuth();
  const navigate = useNavigate();

  const [loginOpen, setLoginOpen]       = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [regRole, setRegRole]           = useState("student");
  const [submitting, setSubmitting]     = useState(false);

  const getDashboardPath = () => {
    if (user?.role === "alumni") return "/alumni-dashboard";
    if (user?.role === "admin")  return "/admin";
    return "/student-dashboard";
  };

  // ── Login ────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await signIn(
      fd.get("email"),
      fd.get("password")
    );
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    setLoginOpen(false);
    toast.success("Welcome back!");
    // Wait one tick for user state to settle, then redirect
    setTimeout(() => {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      if (stored.role === "alumni") navigate("/alumni-dashboard");
      else if (stored.role === "admin") navigate("/admin");
      else navigate("/student-dashboard");
    }, 50);
  };

  // ── Register ─────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);

    if (fd.get("password") !== fd.get("confirmPassword")) {
      toast.error("Passwords do not match.");
      setSubmitting(false);
      return;
    }

    const { error } = await signUp(
      fd.get("email"),
      fd.get("password"),
      fd.get("name"),
      regRole
    );
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    setRegisterOpen(false);
    toast.success("Account created! You are now logged in.");
    setTimeout(() => {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      if (stored.role === "alumni") navigate("/alumni-dashboard");
      else navigate("/student-dashboard");
    }, 50);
  };

  const handleSignOut = () => {
    signOut();
    setMobileOpen(false);
    navigate("/");
    toast.success("Signed out successfully.");
  };

  // ── Shared nav links ─────────────────────────────────────
  const NavLinks = () => (
    <>
      <a href="/#about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        About
      </a>
      <a href="/#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        How It Works
      </a>
      <a href="/#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        Testimonials
      </a>
    </>
  );

  return (
    <>
      {/* ── Main bar ───────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 bg-card border-b border-border shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-6xl">
          {/* Brand */}
          {/* <Link to="/" className="flex items-center gap-2 font-bold text-primary text-lg shrink-0">
            <GraduationCap className="h-6 w-6" />
            AlumniConnect
          </Link> */}

          {/* change */}
          <Link to="/" className="flex items-center gap-2 font-bold text-primary text-lg shrink-0">
  <img src={logo} alt="SaarthiX" className="h-8 w-auto" />
  
  <span>
    Saarthi<span className="text-orange-500">X</span>
  </span>
</Link>

          {/* Desktop center links */}
          <div className="hidden md:flex items-center gap-6">
            <NavLinks />
          </div>

          {/* Desktop right actions */}
          <div className="hidden md:flex items-center gap-3">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : isAuthenticated ? (
              <>
                <Link
                  to={getDashboardPath()}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
                <Link
                  to="/profile"
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <User className="h-4 w-4" />
                  Profile
                </Link>
                <div className="h-4 w-px bg-border" />
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setLoginOpen(true)}
                  className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => setRegisterOpen(true)}
                  className="btn-primary text-sm px-4 py-2"
                >
                  Join Now
                </button>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden p-1 rounded-md hover:bg-muted transition-colors"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-card px-4 py-4 space-y-3 animate-fade-in">
            <div className="flex flex-col gap-2 pb-3 border-b border-border">
              <NavLinks />
            </div>
            {isAuthenticated ? (
              <>
                <Link
                  to={getDashboardPath()}
                  className="flex items-center gap-2 text-sm py-1"
                  onClick={() => setMobileOpen(false)}
                >
                  <LayoutDashboard className="h-4 w-4" /> Dashboard
                </Link>
                <Link
                  to="/profile"
                  className="flex items-center gap-2 text-sm py-1"
                  onClick={() => setMobileOpen(false)}
                >
                  <User className="h-4 w-4" /> Profile
                </Link>
                <button
                  className="flex items-center gap-2 text-sm text-destructive py-1"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4" /> Sign Out
                </button>
              </>
            ) : (
              <div className="flex gap-3 pt-1">
                <button
                  className="flex-1 text-sm font-medium border border-border rounded-md py-2 hover:bg-muted transition-colors"
                  onClick={() => { setLoginOpen(true); setMobileOpen(false); }}
                >
                  Sign In
                </button>
                <button
                  className="flex-1 btn-primary text-sm py-2"
                  onClick={() => { setRegisterOpen(true); setMobileOpen(false); }}
                >
                  Join Now
                </button>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* ── Login Modal ────────────────────────────────────── */}
      <Modal open={loginOpen} onClose={() => setLoginOpen(false)}>
        <h2 className="text-lg font-bold mb-1">Welcome back</h2>
        <p className="text-sm text-muted-foreground mb-5">Sign in to your account</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Email</label>
            <Input name="email" type="email" required placeholder="you@example.com" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Password</label>
            <Input name="password" type="password" required placeholder="••••••••" />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign In
          </button>
        </form>
        <p className="text-sm text-center mt-5 text-muted-foreground">
          No account?{" "}
          <button
            className="text-primary font-medium underline-offset-2 hover:underline"
            onClick={() => { setLoginOpen(false); setRegisterOpen(true); }}
          >
            Create one
          </button>
        </p>
      </Modal>

      {/* ── Register Modal ─────────────────────────────────── */}
      <Modal open={registerOpen} onClose={() => setRegisterOpen(false)}>
        <h2 className="text-lg font-bold mb-1">Create your account</h2>
        <p className="text-sm text-muted-foreground mb-5">Join the AlumniConnect community</p>
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Full Name</label>
            <Input name="name" required placeholder="John Doe" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Email</label>
            <Input name="email" type="email" required placeholder="you@example.com" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Password</label>
            <Input name="password" type="password" required placeholder="Min. 6 characters" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Confirm Password</label>
            <Input name="confirmPassword" type="password" required placeholder="Re-enter password" />
          </div>

          {/* Role selector */}
          <div>
            <label className="text-sm font-medium block mb-2">I am a…</label>
            <div className="grid grid-cols-2 gap-2">
              {["student", "alumni"].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRegRole(r)}
                  className={`py-2.5 rounded-md text-sm border capitalize font-medium transition-all ${
                    regRole === r
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {r === "student" ? "🎓 Student" : "👔 Alumni"}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Account
          </button>
        </form>
        <p className="text-sm text-center mt-5 text-muted-foreground">
          Already have an account?{" "}
          <button
            className="text-primary font-medium underline-offset-2 hover:underline"
            onClick={() => { setRegisterOpen(false); setLoginOpen(true); }}
          >
            Sign in
          </button>
        </p>
      </Modal>
    </>
  );
}

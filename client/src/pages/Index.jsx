import { useNavigate } from "react-router-dom";
import {
  Users, UserCheck, CalendarCheck, Star,
  ArrowRight, UserPlus, Send, Video, MessageSquare,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import MentorshipStepper from "../components/MentorshipStepper";

export default function Index() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const handleCTA = (role) => {
    if (isAuthenticated) {
      if (user?.role === "alumni") navigate("/alumni-dashboard");
      else if (user?.role === "admin") navigate("/admin");
      else navigate("/student-dashboard");
    } else {
      if (role === "student") navigate("/student-signup");
      else if (role === "alumni") navigate("/alumni-signup");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* ========== Hero ========== */}
      <section className="relative text-primary-foreground py-24 md:py-36 overflow-hidden">
        <img
          src="/hero-bg.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 hero-gradient opacity-75" />
        <div className="relative z-10 container mx-auto px-4 text-center max-w-3xl">
          <span className="inline-block px-3 py-1 rounded-full bg-white/20 text-xs font-semibold tracking-wide uppercase mb-5">
            Structured Alumni Mentorship
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-5 leading-tight">
            Reconnect.&nbsp;Mentor.&nbsp;Grow.
          </h1>
          <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            A platform that connects students with verified alumni for guided,
            workflow-driven career mentorship - not just networking.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => handleCTA("student")}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-white text-primary font-semibold text-base hover:bg-white/90 transition-colors shadow-sm"
            >
              <UserPlus className="h-5 w-5" /> Join as Student
            </button>
            <button
              onClick={() => handleCTA("alumni")}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-white/40 text-white font-semibold text-base hover:bg-white/10 transition-colors"
            >
              Join as Alumni <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ========= Stats ======== */}
      <section className="py-16 -mt-12 relative z-10">
        <div className="container mx-auto px-4 grid md:grid-cols-3 gap-6 max-w-4xl">
          {[
            { icon: UserCheck,    label: "Verified Alumni",    value: "2,500+" },
            { icon: Users,        label: "Active Mentors",     value: "850+"   },
            { icon: CalendarCheck,label: "Sessions Completed", value: "12,000+"},
          ].map((s) => (
            <div
              key={s.label}
              className="stat-card flex items-center gap-4 animate-fade-in"
            >
              <div className="h-12 w-12 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
                <s.icon className="h-6 w-6 text-secondary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ======= How It Works ========= */}
      <section id="how-it-works" className="py-20 bg-card">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-3xl font-bold text-center mb-3">How It Works</h2>
          <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
            Our structured 4-step mentorship workflow ensures quality interactions
            between students and alumni.
          </p>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: UserPlus,      title: "Create Profile",  desc: "Sign up and get verified by the admin team"     },
              { icon: Send,          title: "Send Request",    desc: "Browse alumni and send a mentorship request"    },
              { icon: Video,         title: "Attend Session",  desc: "Join your scheduled mentorship session"         },
              { icon: MessageSquare, title: "Give Feedback",   desc: "Rate and review your mentorship experience"     },
            ].map((step, i) => (
              <div
                key={step.title}
                className="text-center animate-fade-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="h-14 w-14 rounded-full hero-gradient flex items-center justify-center mx-auto mb-4 shadow-md">
                  <step.icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <div className="text-xs font-semibold text-secondary mb-1">
                  Step {i + 1}
                </div>
                <h3 className="font-semibold mb-1">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 dashboard-card flex flex-col items-center">
  <h3 className="font-semibold mb-4 text-center">
    Mentorship Progress Tracker
  </h3>

  <div className="w-full flex justify-center">
    <MentorshipStepper currentStep="scheduled" />
  </div>
</div>
        </div>
      </section>

      {/* ========== Testimonials ========= */}
      <section id="testimonials" className="py-20">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-3xl font-bold text-center mb-12">
            What Our Community Says
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "Ananya Gupta",
                role: "Student, CSE 2024",
                text: "The mentorship I received helped me land my dream internship at Microsoft!",
                rating: 5,
              },
              {
                name: "Vikram Singh",
                role: "Alumni, Batch 2018",
                text: "Giving back to my college through structured mentorship feels incredibly rewarding.",
                rating: 5,
              },
              {
                name: "Sneha Reddy",
                role: "Student, ECE 2023",
                text: "The session scheduling and feedback system is so well organised. Best platform!",
                rating: 4,
              },
            ].map((t) => (
              <div key={t.name} className="dashboard-card">
                <div className="flex gap-1 mb-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < t.rating
                          ? "text-yellow-500 fill-yellow-500"
                          : "text-muted"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mb-4 italic">
                  "{t.text}"
                </p>
                <div>
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========= About ========== */}
      <section id="about" className="py-20 bg-card">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h2 className="text-3xl font-bold mb-4">About SaarthiX</h2>
          <p className="text-muted-foreground leading-relaxed">
            SaarthiX is a structured mentorship platform designed to bridge
            the gap between current students and graduated alumni. Unlike social
            networks, we focus on purposeful, workflow-driven mentorship with
            verified profiles, scheduled sessions, and feedback loops — all
            powered by a real backend with zero third-party auth dependencies.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}

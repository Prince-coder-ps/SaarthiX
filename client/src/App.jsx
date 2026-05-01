import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";

import Index           from "./pages/Index";
import StudentDashboard from "./pages/StudentDashboard";
import AlumniDashboard  from "./pages/AlumniDashboard";
import AdminPanel       from "./pages/AdminPanel";
import ProfilePage      from "./pages/ProfilePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,       // 1 minute
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Sonner toast notifications */}
        <Toaster position="top-right" richColors closeButton />

        <BrowserRouter>
          <Routes>
            <Route path="/"                   element={<Index />}            />
            <Route path="/student-signup"     element={<Index />}            />
            <Route path="/alumni-signup"      element={<Index />}            />
            <Route path="/student-dashboard"  element={<StudentDashboard />} />
            <Route path="/alumni-dashboard"   element={<AlumniDashboard />}  />
            <Route path="/admin"              element={<AdminPanel />}       />
            <Route path="/profile"            element={<ProfilePage />}      />

            {/* 404 */}
            <Route
              path="*"
              element={
                <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
                  <h1 className="text-6xl font-extrabold text-primary">404</h1>
                  <p className="text-muted-foreground">
                    Sorry, we couldn't find that page.
                  </p>
                  <a
                    href="/"
                    className="btn-primary px-6 py-2 text-sm"
                  >
                    Go Home
                  </a>
                </div>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

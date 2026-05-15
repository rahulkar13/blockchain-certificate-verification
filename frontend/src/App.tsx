import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type DragEvent, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Index from "./pages/Index";
import IssueCertificate from "./pages/IssueCertificate";
import VerifyCertificate from "./pages/VerifyCertificate";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminSettings from "./pages/AdminSettings";
import AdminAuditTrail from "./pages/AdminAuditTrail";
import PublicCertificate from "./pages/PublicCertificate";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import { getApiBaseUrl } from "./utils/api";
import { clearAdminSession, saveAdminUserSession } from "./utils/adminSession";

const queryClient = new QueryClient();
const APP_CLIENT_VERSION = "2026-05-14-admin-verify-v2";
const APP_CLIENT_VERSION_KEY = "blockcert-client-version";
const GLOBAL_AUTO_REFRESH_INTERVAL_MS = 15000;

const resetStaleClientState = () => {
  if (typeof window === "undefined") return;

  const currentVersion = localStorage.getItem(APP_CLIENT_VERSION_KEY);
  if (currentVersion === APP_CLIENT_VERSION) return;

  const theme = localStorage.getItem("certichain-theme");
  localStorage.removeItem("adminToken");
  localStorage.removeItem("adminUser");
  localStorage.removeItem("blockcertAdminSettings");
  localStorage.setItem(APP_CLIENT_VERSION_KEY, APP_CLIENT_VERSION);

  if (theme) {
    localStorage.setItem("certichain-theme", theme);
  }
};

resetStaleClientState();

const RequireAdminLogin = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const isLoggedIn =
    typeof window !== "undefined" && Boolean(localStorage.getItem("adminToken"));

  if (!isLoggedIn) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

const buildAdminSession = (data: any) => ({
  _id: data._id,
  name: data.name || "Admin",
  email: data.email || "",
  walletAddress: data.walletAddress || "",
  role: data.role || "admin",
  status: data.status || "active",
  plan: data.plan,
  planUpgradeRequest: data.planUpgradeRequest || { status: "none" },
  branding: data.branding || {},
  institutionVerification: data.institutionVerification || {
    status: "unverified",
    locked: false,
  },
});

const GlobalAutoRefresh = () => {
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    if (!token || location.pathname === "/admin/login") return;

    let cancelled = false;

    const refreshAdminSession = async () => {
      if (document.visibilityState !== "visible") return;

      try {
        const response = await fetch(`${getApiBaseUrl()}/api/admin/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401) {
          clearAdminSession();
          return;
        }

        if (!response.ok) return;

        const data = await response.json();
        if (!cancelled) {
          saveAdminUserSession(buildAdminSession(data));
        }
      } catch {
        return;
      }
    };

    void refreshAdminSession();
    const intervalId = window.setInterval(
      refreshAdminSession,
      GLOBAL_AUTO_REFRESH_INTERVAL_MS
    );
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshAdminSession();
      }
    };

    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [location.pathname]);

  return null;
};

const isLinkOrButtonDrag = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("a, button, [role='button']"));
};

const isTextDropTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const editable = target.closest("input, textarea, [contenteditable='true']");
  if (!editable) return false;

  if (editable instanceof HTMLInputElement) {
    return !["file", "checkbox", "radio", "range", "color", "button", "submit"].includes(
      editable.type
    );
  }

  return true;
};

const isTextOrUrlDrag = (event: DragEvent<HTMLElement>) => {
  const types = Array.from(event.dataTransfer?.types || []);
  return types.includes("text/uri-list") || types.includes("text/plain");
};

const preventAccidentalUrlDrop = (event: DragEvent<HTMLElement>) => {
  if (isTextDropTarget(event.target) && isTextOrUrlDrag(event)) {
    event.preventDefault();
    event.stopPropagation();
  }
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div
          className="app-shell min-h-screen text-foreground"
          onDragStartCapture={(event) => {
            if (isLinkOrButtonDrag(event.target)) {
              event.preventDefault();
            }
          }}
          onDragOverCapture={preventAccidentalUrlDrop}
          onDropCapture={preventAccidentalUrlDrop}
        >
          <GlobalAutoRefresh />
          <Navbar />

          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/issue" element={<IssueCertificate />} />
            <Route
              path="/verify"
              element={
                <RequireAdminLogin>
                  <VerifyCertificate />
                </RequireAdminLogin>
              }
            />
            <Route
              path="/verify/:id"
              element={
                <RequireAdminLogin>
                  <PublicCertificate />
                </RequireAdminLogin>
              }
            />

            {/* ✅ Admin System */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/audit" element={<AdminAuditTrail />} />
            <Route path="/super-admin/dashboard" element={<SuperAdminDashboard />} />

            {/* Catch-all route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Footer />
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

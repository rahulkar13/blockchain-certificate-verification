import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DragEvent, ReactNode } from "react";
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

const queryClient = new QueryClient();

const RequireAdminLogin = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const isLoggedIn =
    typeof window !== "undefined" && Boolean(localStorage.getItem("adminToken"));

  if (!isLoggedIn) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
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

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileCheck, GraduationCap, History, Settings, Shield, Users } from "lucide-react";
import { ADMIN_USER_REFRESH_EVENT } from "@/utils/adminSession";

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminRole, setAdminRole] = useState("admin");

  const syncAdminNavState = () => {
    const token = localStorage.getItem("adminToken");
    setIsAdminLoggedIn(!!token);
    try {
      const savedUser = JSON.parse(localStorage.getItem("adminUser") || "{}");
      setAdminRole(savedUser.role || "admin");
    } catch {
      setAdminRole("admin");
    }
  };

  useEffect(() => {
    syncAdminNavState();
  }, [location]);

  useEffect(() => {
    window.addEventListener(ADMIN_USER_REFRESH_EVENT, syncAdminNavState);
    return () => window.removeEventListener(ADMIN_USER_REFRESH_EVENT, syncAdminNavState);
  }, []);

  return (
    <nav className="sticky top-0 z-50 border-b border-border/70 bg-card/90 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <div className="brand-gradient rounded-lg p-2 shadow-[var(--glow-primary)]">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <span className="brand-text text-xl font-bold">BlockCert</span>
          </Link>

          <div className="flex items-center gap-3">
            {isAdminLoggedIn && (
              <Link to="/verify">
                <Button
                  variant={location.pathname === "/verify" ? "default" : "outline"}
                  className="hidden shadow-sm sm:flex"
                >
                  <FileCheck className="mr-2 h-4 w-4" />
                  Verify
                </Button>
              </Link>
            )}

            {isAdminLoggedIn ? (
              adminRole === "super_admin" ? (
                <Link to="/super-admin/dashboard">
                  <Button
                    variant={location.pathname.includes("/super-admin") ? "default" : "outline"}
                    className="hidden shadow-sm sm:flex"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Super Admin
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/admin/dashboard">
                    <Button
                      variant={location.pathname.includes("/admin/dashboard") ? "default" : "outline"}
                      className="hidden shadow-sm sm:flex"
                    >
                      <Shield className="mr-2 h-4 w-4" />
                      Dashboard
                    </Button>
                  </Link>
                  <Link to="/admin/audit">
                    <Button
                      variant={location.pathname.includes("/admin/audit") ? "default" : "outline"}
                      size="icon"
                      className="hidden shadow-sm sm:flex"
                      title="Audit Trail"
                      aria-label="Audit Trail"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to="/admin/settings">
                    <Button
                      variant={location.pathname.includes("/admin/settings") ? "default" : "outline"}
                      size="icon"
                      className="hidden shadow-sm sm:flex"
                      title="Settings"
                      aria-label="Settings"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </Link>
                </>
              )
            ) : (
              <Link to="/admin/login">
                <Button
                  variant={location.pathname === "/admin/login" ? "default" : "outline"}
                  className="hidden shadow-sm sm:flex"
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Admin Login
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

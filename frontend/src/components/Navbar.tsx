

import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GraduationCap, FileCheck, Shield } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);

  // ✅ Check admin login state
  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    setIsAdminLoggedIn(!!token);
  }, [location]);

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    setIsAdminLoggedIn(false);
    navigate("/admin/login");
  };

  return (
    <nav className="border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-gradient-to-r from-blockchain-primary to-blockchain-secondary">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <span className="font-bold text-xl bg-gradient-to-r from-blockchain-primary to-blockchain-secondary bg-clip-text text-transparent">
              BlockCert
            </span>
          </Link>

          {/* ✅ Right-side buttons */}
          <div className="flex items-center gap-3">
            <Link to="/verify">
              <Button
                variant={location.pathname === "/verify" ? "default" : "outline"}
                className="hidden sm:flex"
              >
                <FileCheck className="mr-2 h-4 w-4" />
                Verify
              </Button>
            </Link>

            {isAdminLoggedIn ? (
              <>
                <Link to="/admin/dashboard">
                  <Button
                    variant={location.pathname.includes("/admin/dashboard") ? "default" : "outline"}
                    className="hidden sm:flex"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Dashboard
                  </Button>
                </Link>
                <Button
                  variant="destructive"
                  className="hidden sm:flex"
                  onClick={handleLogout}
                >
                  Logout
                </Button>
                
              </>
            ) : (
              <Link to="/admin/login">
                <Button
                  variant={location.pathname === "/admin/login" ? "default" : "outline"}
                  className="hidden sm:flex"
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

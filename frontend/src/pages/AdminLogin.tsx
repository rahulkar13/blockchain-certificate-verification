// import React, { useState } from "react";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Button } from "@/components/ui/button";
// import { toast } from "@/hooks/use-toast";
// import { useNavigate } from "react-router-dom";

// export default function AdminLogin() {
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [loading, setLoading] = useState(false);
//   const navigate = useNavigate();

//   const handleLogin = async (e: React.FormEvent) => {
//     e.preventDefault();

//     if (!email || !password) {
//       toast({
//         title: "Missing fields",
//         description: "Please enter both email and password.",
//         variant: "destructive",
//       });
//       return;
//     }

//     try {
//       setLoading(true);

//       // ✅ Connect to backend API
//       const response = await fetch("http://localhost:5000/api/admin/login", {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({ email, password }),
//       });

//       const data = await response.json();

//       if (!response.ok) {
//         toast({
//           title: "Login failed",
//           description: data.message || "Invalid credentials",
//           variant: "destructive",
//         });
//         return;
//       }

//       // ✅ Save token in localStorage
//       localStorage.setItem("adminToken", data.token);

//       toast({
//         title: "✅ Login successful",
//         description: `Welcome back, ${data.name || "Admin"}!`,
//       });

//       // ✅ Redirect to dashboard
//       navigate("/admin/dashboard");
//     } catch (err) {
//       console.error("Login error:", err);
//       toast({
//         title: "Login error",
//         description: "Something went wrong. Please try again.",
//         variant: "destructive",
//       });
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-blue-50 to-purple-100">
//       <Card className="w-full max-w-md shadow-xl">
//         <CardHeader>
//           <CardTitle className="text-center text-2xl font-semibold">
//             Admin Login
//           </CardTitle>
//         </CardHeader>
//         <CardContent>
//           <form onSubmit={handleLogin} className="space-y-4">
//             <div>
//               <Label>Email</Label>
//               <Input
//                 type="email"
//                 value={email}
//                 onChange={(e) => setEmail(e.target.value)}
//                 placeholder="admin@example.com"
//                 required
//               />
//             </div>

//             <div>
//               <Label>Password</Label>
//               <Input
//                 type="password"
//                 value={password}
//                 onChange={(e) => setPassword(e.target.value)}
//                 placeholder="••••••••"
//                 required
//               />
//             </div>

//             <Button
//               type="submit"
//               disabled={loading}
//               className="w-full bg-gradient-to-r from-blockchain-primary to-blockchain-secondary"
//             >
//               {loading ? "Logging in..." : "Login"}
//             </Button>
//           </form>
//         </CardContent>
//       </Card>
//     </div>
//   );
// }


import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/hooks/use-toast"; // ✅ use your existing toast hook

const AdminLogin = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  // ✅ Redirect to dashboard if already logged in
  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    if (token) navigate("/admin/dashboard");
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      toast({
        title: "Missing fields",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // ✅ Correct backend URL (same as your server.js base)
      const response = await fetch("http://localhost:5000/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Login failed",
          description: data.message || "Invalid credentials",
          variant: "destructive",
        });
        return;
      }

      // ✅ Save token and user info
      localStorage.setItem("adminToken", data.token);
      localStorage.setItem(
        "adminUser",
        JSON.stringify({
          name: data.name,
          email: data.email,
        })
      );

      toast({
        title: "✅ Login successful",
        description: `Welcome back, ${data.name || "Admin"}!`,
      });

      // ✅ Go to dashboard
      navigate("/admin/dashboard");
    } catch (error) {
      console.error("Login error:", error);
      toast({
        title: "Login error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--gradient-hero)] flex items-center justify-center px-4 relative">
      {/* Theme toggle button */}
      {/* <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div> */}

      <Card className="w-full max-w-md border-border shadow-[var(--shadow-card)]">
        <CardHeader className="space-y-3">
          <div className="flex justify-center">
            <div className="p-3 bg-primary/10 rounded-full">
              <Shield className="h-10 w-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center text-card-foreground">
            Admin Login
          </CardTitle>
          <CardDescription className="text-center">
            Sign in to access the Certificate Management System
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="admin@example.com"
                value={formData.email}
                onChange={handleChange}
                disabled={isLoading}
                required
                className="bg-card border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                disabled={isLoading}
                required
                className="bg-card border-border"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;

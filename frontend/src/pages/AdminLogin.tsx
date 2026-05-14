import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Eye,
  EyeOff,
  Fingerprint,
  GraduationCap,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Shield,
  UserPlus,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getApiBaseUrl } from "@/utils/api";

const AdminLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [isSignupLoading, setIsSignupLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<"request" | "reset">("request");
  const [signupStep, setSignupStep] = useState<"details" | "verify">("details");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [signupForm, setSignupForm] = useState({
    name: "",
    email: "",
    password: "",
    otp: "",
  });
  const [forgotForm, setForgotForm] = useState({
    email: "",
    code: "",
    password: "",
  });

  const getPostLoginPath = (role = "admin") => {
    const from = (location.state as { from?: { pathname?: string; search?: string } } | null)
      ?.from;

    if (from?.pathname?.startsWith("/verify")) {
      return `${from.pathname}${from.search || ""}`;
    }

    return role === "super_admin" ? "/super-admin/dashboard" : "/admin/dashboard";
  };

  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    if (token) {
      try {
        const savedUser = JSON.parse(localStorage.getItem("adminUser") || "{}");
        navigate(getPostLoginPath(savedUser.role || "admin"));
      } catch {
        localStorage.removeItem("adminUser");
        navigate("/admin/dashboard");
      }
    }
  }, [navigate, location.state]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const storeAdminSession = (data: any) => {
    localStorage.setItem("adminToken", data.token);
    localStorage.setItem(
      "adminUser",
      JSON.stringify({
        _id: data._id,
        name: data.name,
        email: data.email,
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
      })
    );
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
      const response = await fetch(`${getApiBaseUrl()}/api/admin/login`, {
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

      storeAdminSession(data);

      toast({
        title: "Login successful",
        description: `Welcome back, ${data.name || "Admin"}!`,
      });

      navigate(getPostLoginPath(data.role || "admin"));
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

  const handleForgotOpenChange = (open: boolean) => {
    setForgotOpen(open);

    if (open) {
      setForgotStep("request");
      setShowResetPassword(false);
      setForgotForm((prev) => ({
        email: formData.email || prev.email,
        code: "",
        password: "",
      }));
    }
  };

  const handleForgotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForgotForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSignupOpenChange = (open: boolean) => {
    setSignupOpen(open);
    if (open) {
      setSignupStep("details");
      setShowSignupPassword(false);
      setSignupForm((prev) => ({
        ...prev,
        email: formData.email || prev.email,
        otp: "",
      }));
    }
  };

  const handleSignupChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSignupForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const sendSignupOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const name = signupForm.name.trim();
    const email = signupForm.email.trim();
    const password = signupForm.password;

    if (!name || !email || !password) {
      toast({
        title: "Missing details",
        description: "Enter name, email, and password to create a trial account.",
        variant: "destructive",
      });
      return false;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return false;
    }

    setIsSignupLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/admin/signup/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not send signup code.");
      }

      setSignupStep("verify");
      toast({
        title: "Signup code sent",
        description: "Check your email and enter the 6-digit code.",
      });
      return true;
    } catch (error: any) {
      toast({
        title: "Signup failed",
        description: error?.message || "Could not send signup code.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSignupLoading(false);
    }
  };

  const handleSignupRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = signupForm.name.trim();
    const email = signupForm.email.trim();
    const password = signupForm.password;
    const otp = signupForm.otp.trim();

    if (!name || !email || !password || !otp) {
      toast({
        title: "Missing details",
        description: "Enter the signup code sent to your email.",
        variant: "destructive",
      });
      return;
    }

    setIsSignupLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/admin/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, otp }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not create account.");
      }

      storeAdminSession(data);
      setSignupOpen(false);
      setSignupStep("details");
      setSignupForm({ name: "", email: "", password: "", otp: "" });
      toast({
        title: "Trial account created",
        description: "You can issue 5 trial certificates before institution verification.",
      });
      navigate("/admin/dashboard");
    } catch (error: any) {
      toast({
        title: "Signup failed",
        description: error?.message || "Could not create account.",
        variant: "destructive",
      });
    } finally {
      setIsSignupLoading(false);
    }
  };

  const requestPasswordResetCode = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const email = (forgotForm.email || formData.email).trim();
    if (!email) {
      toast({
        title: "Email required",
        description: "Enter your admin email to receive the reset code.",
        variant: "destructive",
      });
      return false;
    }

    setIsForgotLoading(true);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/admin/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast({
          title: "Email not sent",
          description: data.message || "Could not send the email right now. Please try again later.",
          variant: "destructive",
        });
        return false;
      }

      setForgotForm((prev) => ({
        ...prev,
        email,
        code: "",
        password: "",
      }));
      setForgotStep("reset");

      toast({
        title: "Reset code sent",
        description: data.message || "Check your admin email inbox.",
      });

      return true;
    } catch (error) {
      console.error("Forgot password error:", error);
      toast({
        title: "Reset error",
        description: "Could not send reset code. Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsForgotLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();

    const email = forgotForm.email.trim();
    const code = forgotForm.code.trim();
    const password = forgotForm.password;

    if (!email || !code || !password) {
      toast({
        title: "Missing fields",
        description: "Enter email, reset code, and new password.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    setIsForgotLoading(true);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/admin/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, code, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast({
          title: "Reset failed",
          description: data.message || "Invalid or expired reset code.",
          variant: "destructive",
        });
        return;
      }

      setFormData({ email, password: "" });
      setForgotOpen(false);
      setForgotStep("request");
      setForgotForm({ email: "", code: "", password: "" });

      toast({
        title: "Password updated",
        description: data.message || "You can sign in with your new password.",
      });
    } catch (error) {
      console.error("Reset password error:", error);
      toast({
        title: "Reset error",
        description: "Could not update password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsForgotLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-12">
      <div className="container mx-auto grid min-h-[calc(100vh-10rem)] max-w-5xl items-center gap-8 lg:grid-cols-[1fr_0.9fr]">
        <section className="surface-card hidden rounded-lg p-8 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="brand-gradient rounded-lg p-3 shadow-[var(--glow-primary)]">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="section-kicker">Admin Console</p>
              <h1 className="text-3xl font-bold text-foreground">BlockCert</h1>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-4 rounded-lg border border-border bg-background/70 p-4">
              <Shield className="mt-1 h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-foreground">Protected access</p>
                <p className="text-sm text-muted-foreground">
                  Only authorized admins can issue certificate records.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-lg border border-border bg-background/70 p-4">
              <Fingerprint className="mt-1 h-5 w-5 text-accent" />
              <div>
                <p className="font-medium text-foreground">Verifiable actions</p>
                <p className="text-sm text-muted-foreground">
                  Certificate writes are submitted by the platform wallet and
                  verified through the contract registry.
                </p>
              </div>
            </div>
          </div>
        </section>

        <Card className="surface-card w-full">
          <CardHeader className="space-y-3">
            <div className="brand-gradient flex h-12 w-12 items-center justify-center rounded-md text-white">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-2xl">Admin Login</CardTitle>
              <CardDescription>
                Sign in to manage certificate issuance and verification records.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
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
                  className="bg-background/70"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password">Password</Label>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto px-0 text-xs font-semibold"
                    onClick={() => handleForgotOpenChange(true)}
                    disabled={isLoading}
                  >
                    Forgot password?
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password"
                    value={formData.password}
                    onChange={handleChange}
                    disabled={isLoading}
                    required
                    className="bg-background/70 pr-12"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={isLoading}
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full border-primary/35 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                onClick={() => handleSignupOpenChange(true)}
                disabled={isLoading}
              >
                <UserPlus className="h-4 w-4" />
                Signup
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Dialog open={signupOpen} onOpenChange={handleSignupOpenChange}>
        <DialogContent className="surface-card border-border sm:max-w-md">
          <DialogHeader className="space-y-3">
            <div className="brand-gradient flex h-12 w-12 items-center justify-center rounded-md text-white">
              <UserPlus className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle>Signup</DialogTitle>
              <DialogDescription>
                Start with 5 trial certificates. Super admin verification is needed for trusted institution status and more issuing.
              </DialogDescription>
            </div>
          </DialogHeader>

          {signupStep === "details" ? (
            <form onSubmit={sendSignupOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Admin Name</Label>
                <Input
                  id="signup-name"
                  name="name"
                  value={signupForm.name}
                  onChange={handleSignupChange}
                  disabled={isSignupLoading}
                  placeholder="Your name"
                  required
                  className="bg-background/70"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  name="email"
                  type="email"
                  value={signupForm.email}
                  onChange={handleSignupChange}
                  disabled={isSignupLoading}
                  placeholder="you@example.com"
                  required
                  className="bg-background/70"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    name="password"
                    type={showSignupPassword ? "text" : "password"}
                    value={signupForm.password}
                    onChange={handleSignupChange}
                    disabled={isSignupLoading}
                    placeholder="Minimum 6 characters"
                    required
                    className="bg-background/70 pr-12"
                  />
                  <button
                    type="button"
                    aria-label={showSignupPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowSignupPassword((value) => !value)}
                    disabled={isSignupLoading}
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                  >
                    {showSignupPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isSignupLoading}>
                {isSignupLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending code...
                  </>
                ) : (
                  "Send Signup Code"
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignupRegister} className="space-y-4">
              <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-muted-foreground">
                A 6-digit signup code was sent to {signupForm.email}.
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-otp">Signup Code</Label>
                <Input
                  id="signup-otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={signupForm.otp}
                  onChange={handleSignupChange}
                  disabled={isSignupLoading}
                  placeholder="6-digit code"
                  required
                  className="bg-background/70 tracking-[0.28em]"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
                <Button
                  type="button"
                  variant="outline"
                  className="bg-card/80"
                  onClick={() => sendSignupOtp()}
                  disabled={isSignupLoading}
                >
                  Resend
                </Button>
                <Button type="submit" disabled={isSignupLoading}>
                  {isSignupLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Trial Account"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={forgotOpen} onOpenChange={handleForgotOpenChange}>
        <DialogContent className="surface-card border-border sm:max-w-md">
          <DialogHeader className="space-y-3">
            <div className="brand-gradient flex h-12 w-12 items-center justify-center rounded-md text-white">
              <KeyRound className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle>Forgot password</DialogTitle>
              <DialogDescription>
                Receive a reset code on your admin email through SMTP.
              </DialogDescription>
            </div>
          </DialogHeader>

          {forgotStep === "request" ? (
            <form onSubmit={requestPasswordResetCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Admin Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
                  <Input
                    id="forgot-email"
                    name="email"
                    type="email"
                    placeholder="admin@example.com"
                    value={forgotForm.email}
                    onChange={handleForgotChange}
                    disabled={isForgotLoading}
                    required
                    className="bg-background/70 pl-10"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isForgotLoading}>
                {isForgotLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending code...
                  </>
                ) : (
                  "Send Reset Code"
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Admin Email</Label>
                <Input
                  id="reset-email"
                  name="email"
                  type="email"
                  value={forgotForm.email}
                  onChange={handleForgotChange}
                  disabled={isForgotLoading}
                  required
                  className="bg-background/70"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reset-code">Reset Code</Label>
                <Input
                  id="reset-code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={forgotForm.code}
                  onChange={handleForgotChange}
                  disabled={isForgotLoading}
                  required
                  className="bg-background/70 tracking-[0.28em]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    name="password"
                    type={showResetPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    value={forgotForm.password}
                    onChange={handleForgotChange}
                    disabled={isForgotLoading}
                    required
                    className="bg-background/70 pr-12"
                  />
                  <button
                    type="button"
                    aria-label={showResetPassword ? "Hide new password" : "Show new password"}
                    onClick={() => setShowResetPassword((value) => !value)}
                    disabled={isForgotLoading}
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                  >
                    {showResetPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => requestPasswordResetCode()}
                  disabled={isForgotLoading}
                >
                  Resend
                </Button>
                <Button type="submit" disabled={isForgotLoading}>
                  {isForgotLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Password"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminLogin;

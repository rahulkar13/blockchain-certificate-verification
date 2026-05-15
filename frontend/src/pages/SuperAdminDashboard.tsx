import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Ban,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CreditCard,
  FileSearch,
  FileText,
  Loader2,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { getApiBaseUrl } from "@/utils/api";
import { openDataUrlPreview } from "@/utils/dataUrlPreview";

interface ManagedAdmin {
  _id: string;
  name: string;
  email: string;
  walletAddress?: string;
  status: "active" | "suspended";
  plan?: AdminPlan;
  planUpgradeRequest?: PlanUpgradeRequest;
  branding?: AdminBranding;
  institutionVerification?: InstitutionVerification;
  institutionDocuments?: InstitutionDocument[];
  createdAt?: string;
  lastLoginAt?: string;
}

interface AdminBranding {
  instituteName?: string;
  instituteWebsite?: string;
  instituteAddress?: string;
  logoDataUrl?: string;
  signatureDataUrl?: string;
  stampDataUrl?: string;
}

interface InstitutionVerification {
  status: "unverified" | "pending" | "verified" | "rejected" | "suspended";
  locked?: boolean;
  submittedAt?: string;
  reviewedAt?: string;
  note?: string;
}

interface InstitutionDocument {
  type: "registration_certificate" | "authorization_letter" | "other";
  label?: string;
  fileName?: string;
  dataUrl: string;
  uploadedAt?: string;
}

interface AdminPlan {
  name: "trial" | "basic" | "pro" | "enterprise" | "custom";
  status: "trial" | "active" | "paused" | "expired";
  certificateLimit: number;
  issuedCount: number;
  remaining: number;
  expiresAt?: string;
}

interface PlanUpgradeRequest {
  status: "none" | "pending" | "approved" | "rejected";
  requestedPlan?: {
    name?: string;
    status?: string;
    certificateLimit?: number;
  };
  message?: string;
  payment?: PlanPaymentProof;
  requestedAt?: string;
  reviewedAt?: string;
  responseNote?: string;
}

interface PlanPaymentProof {
  method?: "upi" | "bank_transfer" | "cash" | "other";
  upiTransactionId?: string;
  proofFileName?: string;
  proofDataUrl?: string;
  submittedAt?: string;
}

type PlanDraft = {
  name: string;
  status: string;
  certificateLimit: string;
  expiresAt: string;
};

type NumberStepperInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
};

const emptyForm = {
  name: "",
  email: "",
  password: "",
  planName: "trial",
  planStatus: "trial",
  certificateLimit: "5",
  expiresAt: "",
};

const planLimitPresets: Record<string, string> = {
  trial: "5",
  basic: "100",
  pro: "500",
  enterprise: "5000",
  custom: "100",
};

const planOptions = [
  { value: "trial", label: "Trial" },
  { value: "basic", label: "Basic" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
  { value: "custom", label: "Custom" },
];

const planStatusOptions = [
  { value: "trial", label: "Trial" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "expired", label: "Expired" },
];

const institutionStatusLabels: Record<InstitutionVerification["status"], string> = {
  unverified: "Unverified",
  pending: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
  suspended: "Suspended",
};

const institutionStatusClass = (status: InstitutionVerification["status"] = "unverified") => {
  if (status === "verified") {
    return "border-secondary/45 bg-secondary/10 text-secondary";
  }
  if (status === "pending") {
    return "border-primary/45 bg-primary/10 text-primary";
  }
  if (status === "rejected" || status === "suspended") {
    return "border-destructive/45 bg-destructive/10 text-destructive";
  }
  return "border-border bg-muted/50 text-muted-foreground";
};

const AUTO_REFRESH_INTERVAL_MS = 15000;

const SuperAdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const token = useMemo(() => localStorage.getItem("adminToken"), []);
  const [admins, setAdmins] = useState<ManagedAdmin[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [busyAdminId, setBusyAdminId] = useState<string | null>(null);
  const [planEdits, setPlanEdits] = useState<Record<string, PlanDraft>>({});
  const [managedAdminSearch, setManagedAdminSearch] = useState("");
  const dirtyPlanEditIdsRef = useRef<Set<string>>(new Set());

  const filteredAdmins = useMemo(() => {
    const query = managedAdminSearch.trim().toLowerCase();
    if (!query) return admins;

    return admins.filter((admin) => {
      const searchableText = [
        admin.name,
        admin.email,
        admin.branding?.instituteName,
        admin.branding?.instituteWebsite,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [admins, managedAdminSearch]);

  const authHeaders = () => ({
    Authorization: `Bearer ${token || ""}`,
    "Content-Type": "application/json",
  });

  const toDateInputValue = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().split("T")[0];
  };

  const toLocalDateValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const parseDateValue = (value?: string) => {
    if (!value) return undefined;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };

  const formatPlanDate = (value?: string) => {
    const date = parseDateValue(value);
    if (!date) return "No expiry";

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getPlanForm = (admin: ManagedAdmin): PlanDraft => ({
    name: admin.plan?.name || "trial",
    status: admin.plan?.status || "trial",
    certificateLimit: String(admin.plan?.certificateLimit ?? 5),
    expiresAt: toDateInputValue(admin.plan?.expiresAt),
  });

  const syncPlanEdits = (
    items: ManagedAdmin[],
    options: { preserveDirty?: boolean } = {}
  ) => {
    const { preserveDirty = false } = options;
    if (!preserveDirty) {
      dirtyPlanEditIdsRef.current.clear();
    }

    setPlanEdits((current) =>
      items.reduce<Record<string, PlanDraft>>(
        (acc, admin) => {
          acc[admin._id] =
            preserveDirty && dirtyPlanEditIdsRef.current.has(admin._id)
              ? current[admin._id] || getPlanForm(admin)
              : getPlanForm(admin);
          return acc;
        },
        {}
      )
    );
  };

  const signOut = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    navigate("/admin/login");
  };

  const loadAdmins = async (
    options: { silent?: boolean; preservePlanDrafts?: boolean } = {}
  ) => {
    const { silent = false, preservePlanDrafts = false } = options;
    if (!token) {
      navigate("/admin/login");
      return;
    }

    if (!silent) {
      setIsLoading(true);
    }
    try {
      const profileResponse = await fetch(`${getApiBaseUrl()}/api/admin/me`, {
        headers: authHeaders(),
      });
      const profile = await profileResponse.json().catch(() => ({}));

      if (!profileResponse.ok) {
        throw new Error(profile.message || "Session expired");
      }

      if (profile.role !== "super_admin") {
        navigate("/admin/dashboard");
        return;
      }

      localStorage.setItem(
        "adminUser",
        JSON.stringify({
          name: profile.name,
          email: profile.email,
          role: profile.role,
          status: profile.status,
        })
      );

      const response = await fetch(`${getApiBaseUrl()}/api/admin/super/admins`, {
        headers: authHeaders(),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not load admins");
      }

      const managedAdmins = data.admins || [];
      setAdmins(managedAdmins);
      syncPlanEdits(managedAdmins, { preserveDirty: preservePlanDrafts });
    } catch (error: any) {
      if (!silent) {
        toast({
          title: "Super admin error",
          description: error?.message || "Could not load super admin dashboard.",
          variant: "destructive",
        });
      } else {
        console.error("Auto-refresh super admin dashboard failed:", error);
      }
      if (String(error?.message || "").toLowerCase().includes("session")) {
        signOut();
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadAdmins();
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible" || busyAdminId || isCreating) {
        return;
      }

      void loadAdmins({ silent: true, preservePlanDrafts: true });
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [busyAdminId, isCreating, token]);

  const createAdmin = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.name || !form.email || !form.password) {
      toast({
        title: "Missing fields",
        description: "Name, email, and password are required.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/admin/super/admins`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          plan: {
            name: form.planName,
            status: form.planStatus,
            certificateLimit: Number(form.certificateLimit || 0),
            expiresAt: form.expiresAt || undefined,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not create admin");
      }

      setAdmins((prev) => [data.admin, ...prev]);
      setPlanEdits((prev) => ({ ...prev, [data.admin._id]: getPlanForm(data.admin) }));
      setForm(emptyForm);
      toast({
        title: "Admin created",
        description: `${data.admin.email} can now sign in as an admin.`,
      });
    } catch (error: any) {
      toast({
        title: "Create failed",
        description: error?.message || "Could not create admin.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const updateAdminStatus = async (admin: ManagedAdmin) => {
    const nextStatus = admin.status === "active" ? "suspended" : "active";
    setBusyAdminId(admin._id);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/admin/super/admins/${admin._id}/status`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ status: nextStatus }),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not update admin status");
      }

      setAdmins((prev) =>
        prev.map((item) => (item._id === admin._id ? data.admin : item))
      );
      toast({
        title: nextStatus === "suspended" ? "Admin suspended" : "Admin activated",
        description: data.admin.email,
      });
    } catch (error: any) {
      toast({
        title: "Status update failed",
        description: error?.message || "Could not update admin status.",
        variant: "destructive",
      });
    } finally {
      setBusyAdminId(null);
    }
  };

  const updateInstitutionStatus = async (
    admin: ManagedAdmin,
    status: InstitutionVerification["status"]
  ) => {
    setBusyAdminId(admin._id);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/admin/super/admins/${admin._id}/institution`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ status }),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not update institution status");
      }

      setAdmins((prev) =>
        prev.map((item) => (item._id === admin._id ? data.admin : item))
      );
      toast({
        title: institutionStatusLabels[status],
        description: data.message || data.admin?.email || admin.email,
      });
    } catch (error: any) {
      toast({
        title: "Institution update failed",
        description: error?.message || "Could not update institution status.",
        variant: "destructive",
      });
    } finally {
      setBusyAdminId(null);
    }
  };

  const updateAdminPlan = async (admin: ManagedAdmin) => {
    const plan = planEdits[admin._id] || getPlanForm(admin);
    const certificateLimit = Number(plan.certificateLimit);

    if (!Number.isFinite(certificateLimit) || certificateLimit < 0) {
      toast({
        title: "Invalid plan limit",
        description: "Certificate limit must be 0 or more.",
        variant: "destructive",
      });
      return;
    }

    setBusyAdminId(admin._id);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/admin/super/admins/${admin._id}/plan`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({
            plan: {
              name: plan.name,
              status: plan.status,
              certificateLimit,
              expiresAt: plan.expiresAt || undefined,
            },
          }),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not update admin plan");
      }

      setAdmins((prev) =>
        prev.map((item) => (item._id === admin._id ? data.admin : item))
      );
      dirtyPlanEditIdsRef.current.delete(admin._id);
      setPlanEdits((prev) => ({ ...prev, [admin._id]: getPlanForm(data.admin) }));
      toast({
        title: "Plan updated",
        description: `${data.admin.email} now has the ${data.admin.plan?.name || "custom"} plan.`,
      });
    } catch (error: any) {
      toast({
        title: "Plan update failed",
        description: error?.message || "Could not update admin plan.",
        variant: "destructive",
      });
    } finally {
      setBusyAdminId(null);
    }
  };

  const reviewPlanRequest = async (
    admin: ManagedAdmin,
    action: "approve" | "reject"
  ) => {
    setBusyAdminId(admin._id);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/admin/super/admins/${admin._id}/plan-request`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ action }),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not review plan request");
      }

      setAdmins((prev) =>
        prev.map((item) => (item._id === admin._id ? data.admin : item))
      );
      dirtyPlanEditIdsRef.current.delete(admin._id);
      setPlanEdits((prev) => ({ ...prev, [admin._id]: getPlanForm(data.admin) }));
      toast({
        title: action === "approve" ? "Plan request approved" : "Plan request rejected",
        description: data.message || admin.email,
      });
    } catch (error: any) {
      toast({
        title: "Plan request failed",
        description: error?.message || "Could not review plan request.",
        variant: "destructive",
      });
    } finally {
      setBusyAdminId(null);
    }
  };

  const updatePlanDraft = (
    adminId: string,
    key: "name" | "status" | "certificateLimit" | "expiresAt",
    value: string
  ) => {
    dirtyPlanEditIdsRef.current.add(adminId);
    setPlanEdits((prev) => ({
      ...prev,
      [adminId]: {
        ...(prev[adminId] || {
          name: "trial",
          status: "trial",
          certificateLimit: "5",
          expiresAt: "",
        }),
        [key]: value,
      },
    }));
  };

  const updateCreatePlanName = (planName: string) => {
    setForm((prev) => ({
      ...prev,
      planName,
      planStatus: planName === "trial" ? "trial" : "active",
      certificateLimit: planLimitPresets[planName] || prev.certificateLimit,
    }));
  };

  const updateManagedPlanName = (admin: ManagedAdmin, planName: string) => {
    dirtyPlanEditIdsRef.current.add(admin._id);
    setPlanEdits((prev) => {
      const current = prev[admin._id] || getPlanForm(admin);
      return {
        ...prev,
        [admin._id]: {
          ...current,
          name: planName,
          status: planName === "trial" ? "trial" : current.status === "trial" ? "active" : current.status,
          certificateLimit: planLimitPresets[planName] || current.certificateLimit,
        },
      };
    });
  };

  const renderPlanSelect = (
    value: string,
    onValueChange: (value: string) => void,
    ariaLabel: string
  ) => (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={ariaLabel} className="h-10 bg-background/70">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" className="border-primary/25 bg-popover/95">
        {planOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderPlanStatusSelect = (
    value: string,
    onValueChange: (value: string) => void,
    ariaLabel: string
  ) => (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={ariaLabel} className="h-10 bg-background/70">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" className="border-primary/25 bg-popover/95">
        {planStatusOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderPlanDatePicker = (
    value: string,
    onValueChange: (value: string) => void,
    ariaLabel: string,
    className = ""
  ) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={`h-10 w-full justify-start bg-background/70 text-left font-normal ${
            value ? "text-foreground" : "text-muted-foreground"
          } ${className}`}
        >
          <CalendarDays className="h-4 w-4 text-primary" />
          {formatPlanDate(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parseDateValue(value)}
          onSelect={(date) => onValueChange(date ? toLocalDateValue(date) : "")}
          initialFocus
        />
        <div className="border-t border-border p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => onValueChange("")}
          >
            Clear expiry
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );

  if (isLoading) {
    return (
      <main className="container mx-auto flex min-h-[70vh] items-center justify-center px-4">
        <div className="flex items-center gap-3 rounded-md border border-border bg-card/80 px-5 py-4 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Loading super admin console...
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-10">
      <section className="mb-8 flex flex-col gap-4 border-b border-border/70 pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="section-kicker mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Super Admin
          </div>
          <h1 className="text-4xl font-bold text-foreground md:text-5xl">
            Control admin access
          </h1>
          <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
            Create admins, assign plans, suspend access, and review certificate
            issue records across every institution.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="bg-card/80"
            onClick={() => navigate("/admin/dashboard")}
          >
            <FileText className="h-4 w-4" />
            All Certificates
          </Button>
          <Button variant="outline" className="bg-card/80" onClick={() => navigate("/verify")}>
            <FileSearch className="h-4 w-4" />
            Verify Certificate
          </Button>
          <Button
            variant="outline"
            className="bg-card/80"
            onClick={loadAdmins}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
          <Button variant="destructive" onClick={signOut}>
            Sign Out
          </Button>
        </div>
      </section>

      <div className="space-y-6">
        <Card className="surface-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-secondary" />
              Create Admin
            </CardTitle>
            <CardDescription>
              New admins can issue certificates after you create their account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createAdmin} className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-name">Admin Name</Label>
                  <Input
                    id="admin-name"
                    value={form.name}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    className="bg-background/70"
                    placeholder="Institution admin"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    className="bg-background/70"
                    placeholder="admin@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Plan</Label>
                  {renderPlanSelect(form.planName, updateCreatePlanName, "Create admin plan")}
                </div>
                <div className="space-y-2">
                  <Label>Plan Status</Label>
                  {renderPlanStatusSelect(
                    form.planStatus,
                    (value) => setForm((prev) => ({ ...prev, planStatus: value })),
                    "Create admin plan status"
                  )}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_1fr_2fr]">
                <div className="space-y-2">
                  <Label htmlFor="admin-limit">Certificate Limit</Label>
                  <NumberStepperInput
                    id="admin-limit"
                    min={0}
                    value={form.certificateLimit}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, certificateLimit: value }))
                    }
                    placeholder="5"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Plan Expiry</Label>
                  {renderPlanDatePicker(
                    form.expiresAt,
                    (value) => setForm((prev) => ({ ...prev, expiresAt: value })),
                    "Create admin plan expiry"
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-password">Temporary Password</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, password: event.target.value }))
                    }
                    className="bg-background/70"
                    placeholder="Minimum 6 characters"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full sm:w-auto" disabled={isCreating}>
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Create Admin
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="surface-card">
          <CardHeader className="gap-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Managed Admins
                </CardTitle>
                <CardDescription>
                  These accounts can access issuing tools unless suspended.
                </CardDescription>
              </div>
              <div className="w-full xl:max-w-md">
                <Label htmlFor="managed-admin-search" className="sr-only">
                  Search managed admins
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="managed-admin-search"
                    value={managedAdminSearch}
                    onChange={(event) => setManagedAdminSearch(event.target.value)}
                    className="bg-background/70 pl-9 pr-24"
                    placeholder="Search name, email, or institute"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {filteredAdmins.length}/{admins.length}
                  </span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border border-border bg-card/70">
              <Table>
                <TableHeader className="bg-muted/70">
                  <TableRow>
                    <TableHead>Admin</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="min-w-[560px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No admin accounts created yet.
                      </TableCell>
                    </TableRow>
                  ) : filteredAdmins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No admin matched "{managedAdminSearch.trim()}".
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAdmins.map((admin) => {
                      const institutionStatus =
                        admin.institutionVerification?.status || "unverified";
                      const instituteName = admin.branding?.instituteName?.trim();
                      const registrationDocument = admin.institutionDocuments?.find(
                        (document) => document.type === "registration_certificate"
                      );
                      const authorizationDocument = admin.institutionDocuments?.find(
                        (document) => document.type === "authorization_letter"
                      );
                      const hasRequiredInstitutionDocuments = Boolean(
                        registrationDocument?.dataUrl && authorizationDocument?.dataUrl
                      );
                      const planRequest = admin.planUpgradeRequest;
                      const hasPendingPlanRequest = planRequest?.status === "pending";

                      return (
                        <TableRow key={admin._id}>
                        <TableCell>
                          <div className="space-y-2">
                            <p className="font-medium text-foreground">{admin.name}</p>
                            <p className="text-sm text-muted-foreground">{admin.email}</p>
                            <div className="rounded-md border border-border bg-background/45 p-2">
                              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                                <Building2 className="h-3.5 w-3.5 text-primary" />
                                {instituteName || "No institute profile"}
                              </div>
                              {admin.branding?.instituteWebsite && (
                                <p className="mt-1 break-all text-xs text-muted-foreground">
                                  {admin.branding.instituteWebsite}
                                </p>
                              )}
                              <span
                                className={`mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${institutionStatusClass(
                                  institutionStatus
                                )}`}
                              >
                                {institutionStatus === "verified" ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : institutionStatus === "suspended" ? (
                                  <Ban className="h-3.5 w-3.5" />
                                ) : (
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                )}
                                {institutionStatusLabels[institutionStatus]}
                              </span>
                              <div className="mt-2 grid gap-1 text-xs">
                                <ProofDocumentLink
                                  label="Registration"
                                  document={registrationDocument}
                                />
                                <ProofDocumentLink
                                  label="Authorization"
                                  document={authorizationDocument}
                                />
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              admin.status === "active"
                                ? "inline-flex items-center gap-1 rounded-md border border-secondary/45 bg-secondary/10 px-2 py-1 text-xs font-medium text-secondary"
                                : "inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"
                            }
                          >
                            {admin.status === "active" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <Ban className="h-3.5 w-3.5" />
                            )}
                            {admin.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm font-semibold capitalize text-foreground">
                              {admin.plan?.name || "trial"}
                            </p>
                            <p className="text-xs capitalize text-muted-foreground">
                              {admin.plan?.status || "trial"}
                            </p>
                            {admin.plan?.expiresAt && (
                              <p className="text-xs text-muted-foreground">
                                Expires {new Date(admin.plan.expiresAt).toLocaleDateString()}
                              </p>
                            )}
                            {planRequest?.status && planRequest.status !== "none" && (
                              <div
                                className={`mt-2 rounded-md border px-2 py-1 text-xs ${
                                  hasPendingPlanRequest
                                    ? "border-primary/35 bg-primary/10 text-primary"
                                    : planRequest.status === "approved"
                                      ? "border-secondary/35 bg-secondary/10 text-secondary"
                                      : "border-destructive/35 bg-destructive/10 text-destructive"
                                }`}
                              >
                                <p className="font-semibold capitalize">
                                  Request {planRequest.status}
                                </p>
                                <p className="capitalize text-muted-foreground">
                                  {planRequest.requestedPlan?.name || "plan"} -{" "}
                                  {planRequest.requestedPlan?.certificateLimit || 0}
                                </p>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            <p className="font-medium text-foreground">
                              {admin.plan?.issuedCount ?? 0} / {admin.plan?.certificateLimit ?? 5}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {admin.plan?.remaining ?? 0} remaining
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {admin.lastLoginAt
                            ? new Date(admin.lastLoginAt).toLocaleString()
                            : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="grid gap-2">
                            {hasPendingPlanRequest && (
                              <div className="rounded-md border border-primary/35 bg-primary/10 p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                      <CreditCard className="h-4 w-4 text-primary" />
                                      Upgrade requested
                                    </p>
                                    <p className="mt-1 text-xs capitalize text-muted-foreground">
                                      {planRequest?.requestedPlan?.name || "Plan"} -{" "}
                                      {planRequest?.requestedPlan?.certificateLimit || 0}{" "}
                                      certificates
                                    </p>
                                    {planRequest?.message && (
                                      <p className="mt-2 text-xs text-muted-foreground">
                                        {planRequest.message}
                                      </p>
                                    )}
                                    <div className="mt-3 rounded-md border border-border bg-background/45 p-2 text-xs">
                                      <p className="font-semibold text-foreground">
                                        Payment proof
                                      </p>
                                      <p className="mt-1 break-all text-muted-foreground">
                                        UPI / Ref:{" "}
                                        {planRequest?.payment?.upiTransactionId ||
                                          "Not provided"}
                                      </p>
                                      <p className="mt-1 capitalize text-muted-foreground">
                                        Method: {planRequest?.payment?.method || "upi"}
                                      </p>
                                      {planRequest?.payment?.proofDataUrl ? (
                                        <button
                                          type="button"
                                          className="mt-2 inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
                                          onClick={() => {
                                            const opened = openDataUrlPreview(
                                              planRequest.payment?.proofDataUrl,
                                              planRequest.payment?.proofFileName ||
                                                "Payment screenshot"
                                            );

                                            if (!opened) {
                                              toast({
                                                title: "Preview unavailable",
                                                description:
                                                  "The uploaded screenshot could not be opened.",
                                                variant: "destructive",
                                              });
                                            }
                                          }}
                                        >
                                          <FileText className="h-3.5 w-3.5" />
                                          View screenshot
                                          {planRequest.payment.proofFileName
                                            ? ` (${planRequest.payment.proofFileName})`
                                            : ""}
                                        </button>
                                      ) : (
                                        <p className="mt-2 text-muted-foreground">
                                          No screenshot uploaded.
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      disabled={busyAdminId === admin._id}
                                      onClick={() => reviewPlanRequest(admin, "approve")}
                                    >
                                      {busyAdminId === admin._id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="h-4 w-4" />
                                      )}
                                      Approve
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="bg-card/80"
                                      disabled={busyAdminId === admin._id}
                                      onClick={() => reviewPlanRequest(admin, "reject")}
                                    >
                                      <Ban className="h-4 w-4" />
                                      Reject
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_0.75fr_1.3fr]">
                              {renderPlanSelect(
                                planEdits[admin._id]?.name ?? admin.plan?.name ?? "trial",
                                (value) => updateManagedPlanName(admin, value),
                                `${admin.email} plan`
                              )}
                              {renderPlanStatusSelect(
                                planEdits[admin._id]?.status ?? admin.plan?.status ?? "trial",
                                (value) => updatePlanDraft(admin._id, "status", value),
                                `${admin.email} plan status`
                              )}
                              <NumberStepperInput
                                min={0}
                                value={
                                  planEdits[admin._id]?.certificateLimit ||
                                  String(admin.plan?.certificateLimit ?? 5)
                                }
                                onChange={(value) =>
                                  updatePlanDraft(
                                    admin._id,
                                    "certificateLimit",
                                    value
                                  )
                                }
                                ariaLabel="Certificate limit"
                                inputClassName="h-9 text-xs"
                              />
                              {renderPlanDatePicker(
                                planEdits[admin._id]?.expiresAt ??
                                  toDateInputValue(admin.plan?.expiresAt),
                                (value) => updatePlanDraft(admin._id, "expiresAt", value),
                                `${admin.email} plan expiry`,
                                "h-9 text-xs"
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={busyAdminId === admin._id}
                                onClick={() => updateAdminPlan(admin)}
                              >
                                {busyAdminId === admin._id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <ShieldCheck className="h-4 w-4" />
                                )}
                                Save Plan
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-card/80"
                                disabled={busyAdminId === admin._id}
                                onClick={() => updateAdminStatus(admin)}
                              >
                                {busyAdminId === admin._id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : admin.status === "active" ? (
                                  <Ban className="h-4 w-4" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                                {admin.status === "active" ? "Suspend" : "Activate"}
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2 rounded-md border border-border bg-background/35 p-2">
                              <Button
                                variant={institutionStatus === "verified" ? "secondary" : "outline"}
                                size="sm"
                                className="bg-card/80"
                                disabled={
                                  busyAdminId === admin._id ||
                                  !instituteName ||
                                  !hasRequiredInstitutionDocuments ||
                                  institutionStatus === "verified"
                                }
                                onClick={() => updateInstitutionStatus(admin, "verified")}
                              >
                                {busyAdminId === admin._id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                                Verify Institution
                              </Button>
                              {!hasRequiredInstitutionDocuments && (
                                <span className="self-center text-xs text-muted-foreground">
                                  Proof documents missing
                                </span>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-card/80"
                                disabled={
                                  busyAdminId === admin._id ||
                                  institutionStatus === "rejected"
                                }
                                onClick={() => updateInstitutionStatus(admin, "rejected")}
                              >
                                <Ban className="h-4 w-4" />
                                Reject
                              </Button>
                              {(institutionStatus === "verified" ||
                                institutionStatus === "suspended") && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="bg-card/80"
                                  disabled={busyAdminId === admin._id}
                                  onClick={() =>
                                    updateInstitutionStatus(
                                      admin,
                                      institutionStatus === "verified"
                                        ? "suspended"
                                        : "verified"
                                    )
                                  }
                                >
                                  {institutionStatus === "verified" ? (
                                    <Ban className="h-4 w-4" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4" />
                                  )}
                                  {institutionStatus === "verified"
                                    ? "Suspend Institution"
                                    : "Restore Institution"}
                                </Button>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

const NumberStepperInput = ({
  id,
  value,
  onChange,
  min = 0,
  placeholder,
  ariaLabel,
  className = "",
  inputClassName = "",
}: NumberStepperInputProps) => {
  const valueRef = useRef(value);
  const repeatDelayRef = useRef<number | null>(null);
  const repeatIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const stopRepeat = () => {
    if (repeatDelayRef.current !== null) {
      window.clearTimeout(repeatDelayRef.current);
      repeatDelayRef.current = null;
    }
    if (repeatIntervalRef.current !== null) {
      window.clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  };

  useEffect(() => stopRepeat, []);

  const adjustValue = (amount: number) => {
    const parsedValue = Number(valueRef.current);
    const baseValue = Number.isFinite(parsedValue) ? parsedValue : min;
    const nextValue = Math.max(baseValue + amount, min);
    const nextValueText = String(nextValue);

    valueRef.current = nextValueText;
    onChange(nextValueText);
  };

  const startRepeat = (
    amount: number,
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    stopRepeat();
    adjustValue(amount);
    repeatDelayRef.current = window.setTimeout(() => {
      repeatIntervalRef.current = window.setInterval(() => {
        adjustValue(amount);
      }, 90);
    }, 360);
  };

  return (
    <div className={`relative ${className}`}>
      <Input
        id={id}
        type="number"
        min={min}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => {
          valueRef.current = event.target.value;
          onChange(event.target.value);
        }}
        className={`theme-number-input bg-background/70 pr-11 ${inputClassName}`}
      />
      <div className="absolute bottom-1 right-1 top-1 flex w-8 flex-col overflow-hidden rounded-md border border-border bg-muted/80">
        <button
          type="button"
          aria-label="Increase certificate limit"
          className="flex flex-1 touch-none select-none items-center justify-center text-muted-foreground transition-colors hover:bg-secondary/15 hover:text-secondary"
          onPointerDown={(event) => startRepeat(1, event)}
          onPointerUp={stopRepeat}
          onPointerCancel={stopRepeat}
          onPointerLeave={stopRepeat}
          onBlur={stopRepeat}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              adjustValue(1);
            }
          }}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <span className="h-px bg-border" />
        <button
          type="button"
          aria-label="Decrease certificate limit"
          className="flex flex-1 touch-none select-none items-center justify-center text-muted-foreground transition-colors hover:bg-secondary/15 hover:text-secondary"
          onPointerDown={(event) => startRepeat(-1, event)}
          onPointerUp={stopRepeat}
          onPointerCancel={stopRepeat}
          onPointerLeave={stopRepeat}
          onBlur={stopRepeat}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              adjustValue(-1);
            }
          }}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

const ProofDocumentLink = ({
  label,
  document,
}: {
  label: string;
  document?: InstitutionDocument;
}) => {
  if (!document?.dataUrl) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        {label}: missing
      </span>
    );
  }

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
      onClick={() =>
        openDataUrlPreview(document.dataUrl, document.fileName || label)
      }
    >
      <FileText className="h-3.5 w-3.5" />
      {label}: {document.fileName || "view proof"}
    </button>
  );
};

export default SuperAdminDashboard;

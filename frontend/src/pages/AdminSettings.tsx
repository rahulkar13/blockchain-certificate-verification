import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Ban,
  Building2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  FileCheck,
  FileText,
  KeyRound,
  Loader2,
  Mail,
  MonitorCog,
  PenLine,
  Save,
  Settings,
  Shield,
  Stamp,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  loadAdminPreferences,
  normalizeCertificateTemplate,
  saveAdminPreferences,
  type AdminPreferences,
} from "@/utils/adminSettings";
import { getApiBaseUrl } from "@/utils/api";
import { openDataUrlPreview } from "@/utils/dataUrlPreview";
import { cn } from "@/lib/utils";

interface AdminBranding {
  instituteName: string;
  instituteWebsite: string;
  instituteAddress: string;
  logoDataUrl: string;
  signatureDataUrl: string;
  stampDataUrl: string;
  certificateTitle: string;
  certificateBody: string;
  certificateFooter: string;
  primaryColor: string;
  secondaryColor: string;
}

interface AdminProfile {
  _id?: string;
  name: string;
  email: string;
  walletAddress: string;
  role?: string;
  status?: string;
  plan?: AdminPlan;
  createdAt?: string;
  branding: AdminBranding;
  institutionVerification?: InstitutionVerification;
  institutionDocuments: InstitutionDocument[];
  planUpgradeRequest?: PlanUpgradeRequest;
}

interface InstitutionDocument {
  type: "registration_certificate" | "authorization_letter" | "other";
  label?: string;
  fileName?: string;
  dataUrl: string;
  uploadedAt?: string;
}

interface AdminPlan {
  name?: string;
  status?: string;
  certificateLimit?: number;
  issuedCount?: number;
  remaining?: number;
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

interface InstitutionVerification {
  status: "unverified" | "pending" | "verified" | "rejected" | "suspended";
  locked?: boolean;
  submittedAt?: string;
  reviewedAt?: string;
  note?: string;
}

const defaultBranding: AdminBranding = {
  instituteName: "",
  instituteWebsite: "",
  instituteAddress: "",
  logoDataUrl: "",
  signatureDataUrl: "",
  stampDataUrl: "",
  certificateTitle: "",
  certificateBody: "",
  certificateFooter: "",
  primaryColor: "#2563EB",
  secondaryColor: "#22C55E",
};

const defaultInstitutionVerification: InstitutionVerification = {
  status: "unverified",
  locked: false,
};

const defaultPlanUpgradeRequest: PlanUpgradeRequest = {
  status: "none",
};

const institutionDocumentLabels: Record<InstitutionDocument["type"], string> = {
  registration_certificate: "Registration certificate",
  authorization_letter: "Authorization letter",
  other: "Other proof",
};

const requiredInstitutionDocumentTypes: InstitutionDocument["type"][] = [
  "registration_certificate",
  "authorization_letter",
];

const AUTO_REFRESH_INTERVAL_MS = 15000;

const planOptions = [
  { value: "basic", label: "Basic", limit: "100" },
  { value: "pro", label: "Pro", limit: "500" },
  { value: "enterprise", label: "Enterprise", limit: "5000" },
  { value: "custom", label: "Custom", limit: "100" },
];

const institutionStatusLabels: Record<InstitutionVerification["status"], string> = {
  unverified: "Institution not submitted",
  pending: "Pending super admin review",
  verified: "Verified institution",
  rejected: "Institution rejected",
  suspended: "Institution suspended",
};

const institutionStatusClass = (status: InstitutionVerification["status"]) => {
  if (status === "verified") return "border-secondary/40 bg-secondary/10 text-secondary";
  if (status === "pending") return "border-primary/40 bg-primary/10 text-primary";
  if (status === "rejected" || status === "suspended") {
    return "border-destructive/40 bg-destructive/10 text-destructive";
  }
  return "border-border bg-muted/40 text-muted-foreground";
};

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });

const AdminSettings: React.FC = () => {
  const navigate = useNavigate();
  const token = useMemo(() => localStorage.getItem("adminToken"), []);
  const [profile, setProfile] = useState<AdminProfile>({
    name: "",
    email: "",
    walletAddress: "",
    branding: defaultBranding,
    institutionDocuments: [],
    institutionVerification: defaultInstitutionVerification,
    planUpgradeRequest: defaultPlanUpgradeRequest,
  });
  const [preferences, setPreferences] = useState<AdminPreferences>(loadAdminPreferences);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isEditingInstitution, setIsEditingInstitution] = useState(false);
  const [isRequestingPlan, setIsRequestingPlan] = useState(false);
  const [planRequestForm, setPlanRequestForm] = useState({
    planName: "basic",
    certificateLimit: "100",
    message: "",
    paymentMethod: "upi",
    upiTransactionId: "",
    paymentProofFileName: "",
    paymentProofDataUrl: "",
  });
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetForm, setResetForm] = useState({
    code: "",
    password: "",
    confirmPassword: "",
  });
  const planLimitRepeatDelayRef = useRef<number | null>(null);
  const planLimitRepeatIntervalRef = useRef<number | null>(null);
  const institutionStatus =
    profile.institutionVerification?.status || defaultInstitutionVerification.status;
  const isInstitutionPending = institutionStatus === "pending";
  const isInstitutionVerified = institutionStatus === "verified";
  const isInstitutionSuspended = institutionStatus === "suspended";
  const isVerifiedInstitutionEdit = isInstitutionVerified && isEditingInstitution;
  const isTrialPlan = profile.plan?.name === "trial";
  const canAccessInstitutionBranding = !isTrialPlan;
  const missingInstitutionDocumentTypes = requiredInstitutionDocumentTypes.filter(
    (type) =>
      !profile.institutionDocuments.some(
        (document) => document.type === type && document.dataUrl
      )
  );
  const hasRequiredInstitutionDocuments = missingInstitutionDocumentTypes.length === 0;
  const institutionFieldsDisabled =
    !canAccessInstitutionBranding || !isEditingInstitution;
  const canRequestInstitutionApproval =
    canAccessInstitutionBranding &&
    !isSavingProfile &&
    Boolean(profile.branding.instituteName.trim()) &&
    hasRequiredInstitutionDocuments &&
    !isInstitutionPending &&
    !isInstitutionSuspended &&
    (!isInstitutionVerified || isEditingInstitution);
  const institutionApprovalLabel = isInstitutionPending
    ? "Pending"
    : isVerifiedInstitutionEdit
      ? "Send for approval"
      : isInstitutionVerified
        ? "Approved"
        : "Approval";
  const institutionApprovalHint =
    isEditingInstitution && !canRequestInstitutionApproval
      ? !profile.branding.instituteName.trim()
        ? "Enter the institute name before sending for approval."
        : !hasRequiredInstitutionDocuments
          ? `Upload ${missingInstitutionDocumentTypes
              .map((type) => institutionDocumentLabels[type])
              .join(" and ")} before sending for approval.`
          : ""
      : "";
  const planRequestStatus = profile.planUpgradeRequest?.status || "none";
  const planLimit = Number(profile.plan?.certificateLimit ?? 5);
  const planRemaining = Number(profile.plan?.remaining ?? 0);
  const planUsed = Math.max(planLimit - planRemaining, 0);
  const planUsagePercent =
    planLimit > 0 ? Math.min(Math.round((planUsed / planLimit) * 100), 100) : 0;
  const isCustomPlanRequest = planRequestForm.planName === "custom";

  useEffect(() => {
    if (!token) {
      toast({
        title: "Login required",
        description: "Please log in before opening admin settings.",
        variant: "destructive",
      });
      navigate("/admin/login");
      return;
    }

    fetchProfile(token);
  }, [navigate, token]);

  useEffect(() => {
    if (
      !token ||
      isEditingInstitution ||
      isSavingProfile ||
      isRequestingPlan ||
      isSendingReset ||
      isResettingPassword
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchProfile(token, { silent: true });
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [
    isEditingInstitution,
    isRequestingPlan,
    isResettingPassword,
    isSavingProfile,
    isSendingReset,
    token,
  ]);

  useEffect(() => {
    return () => {
      if (planLimitRepeatDelayRef.current !== null) {
        window.clearTimeout(planLimitRepeatDelayRef.current);
      }
      if (planLimitRepeatIntervalRef.current !== null) {
        window.clearInterval(planLimitRepeatIntervalRef.current);
      }
    };
  }, []);

  const fetchProfile = async (
    authToken: string,
    options: { silent?: boolean } = {}
  ) => {
    const { silent = false } = options;
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/admin/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (response.status === 401) {
        localStorage.clear();
        navigate("/admin/login");
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load admin settings.");
      }

      const data = await response.json();
      if (data.role === "super_admin") {
        navigate("/super-admin/dashboard");
        return;
      }
      const nextProfile = {
        _id: data._id,
        name: data.name || "Admin",
        email: data.email || "",
        walletAddress: data.walletAddress || "",
        role: data.role || "admin",
        status: data.status || "active",
        plan: data.plan,
        branding: { ...defaultBranding, ...(data.branding || {}) },
        institutionDocuments: Array.isArray(data.institutionDocuments)
          ? data.institutionDocuments
          : [],
        institutionVerification: {
          ...defaultInstitutionVerification,
          ...(data.institutionVerification || {}),
        },
        planUpgradeRequest: {
          ...defaultPlanUpgradeRequest,
          ...(data.planUpgradeRequest || {}),
        },
        createdAt: data.createdAt,
      };
      setProfile(nextProfile);
      if (!silent && nextProfile.planUpgradeRequest?.requestedPlan?.name) {
        setPlanRequestForm({
          planName: nextProfile.planUpgradeRequest.requestedPlan.name,
          certificateLimit: String(
            nextProfile.planUpgradeRequest.requestedPlan.certificateLimit || 100
          ),
          message: nextProfile.planUpgradeRequest.message || "",
          paymentMethod: nextProfile.planUpgradeRequest.payment?.method || "upi",
          upiTransactionId:
            nextProfile.planUpgradeRequest.payment?.upiTransactionId || "",
          paymentProofFileName:
            nextProfile.planUpgradeRequest.payment?.proofFileName || "",
          paymentProofDataUrl:
            nextProfile.planUpgradeRequest.payment?.proofDataUrl || "",
        });
      }
      localStorage.setItem("adminUser", JSON.stringify(nextProfile));
    } catch (error: any) {
      if (!silent) {
        toast({
          title: "Settings not loaded",
          description: error?.message || "Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  const updatePreference = <K extends keyof AdminPreferences>(
    key: K,
    value: AdminPreferences[K]
  ) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const savePreferences = () => {
    saveAdminPreferences(preferences);
    toast({
      title: "Display settings saved",
      description: "Your dashboard preferences were saved on this browser.",
    });
  };

  const saveProfile = async (
    options: { requestInstitutionApproval?: boolean } = {}
  ) => {
    if (!profile.name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter the admin name.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingProfile(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/admin/me`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: profile.name.trim(),
          branding: profile.branding,
          institutionDocuments: profile.institutionDocuments,
          requestInstitutionEdit: isEditingInstitution,
          requestInstitutionApproval: options.requestInstitutionApproval === true,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Settings update failed.");
      }

      const nextProfile = {
        _id: data._id || profile._id,
        name: data.name || profile.name,
        email: data.email || profile.email,
        walletAddress: data.walletAddress || "",
        role: data.role || profile.role,
        status: data.status || profile.status,
        plan: data.plan,
        branding: { ...defaultBranding, ...(data.branding || profile.branding) },
        institutionDocuments: Array.isArray(data.institutionDocuments)
          ? data.institutionDocuments
          : profile.institutionDocuments,
        institutionVerification: {
          ...defaultInstitutionVerification,
          ...(data.institutionVerification || profile.institutionVerification || {}),
        },
        planUpgradeRequest: {
          ...defaultPlanUpgradeRequest,
          ...(data.planUpgradeRequest || profile.planUpgradeRequest || {}),
        },
        createdAt: data.createdAt || profile.createdAt,
      };
      setProfile(nextProfile);
      setIsEditingInstitution(false);
      localStorage.setItem("adminUser", JSON.stringify(nextProfile));
      toast({
        title: "Settings updated",
        description:
          nextProfile.institutionVerification?.status === "pending"
            ? "Institute identity was saved and sent for super admin review."
            : "Your admin profile and institute branding were saved.",
      });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const updatePlanRequestName = (planName: string) => {
    const selectedPlan = planOptions.find((plan) => plan.value === planName);
    setPlanRequestForm((current) => ({
      ...current,
      planName,
      certificateLimit: selectedPlan?.limit || current.certificateLimit,
    }));
  };

  const adjustPlanRequestLimit = (amount: number) => {
    setPlanRequestForm((current) => {
      const nextLimit = Math.max(Number(current.certificateLimit || 0) + amount, 1);
      return {
        ...current,
        certificateLimit: String(nextLimit),
      };
    });
  };

  const stopPlanLimitRepeat = () => {
    if (planLimitRepeatDelayRef.current !== null) {
      window.clearTimeout(planLimitRepeatDelayRef.current);
      planLimitRepeatDelayRef.current = null;
    }
    if (planLimitRepeatIntervalRef.current !== null) {
      window.clearInterval(planLimitRepeatIntervalRef.current);
      planLimitRepeatIntervalRef.current = null;
    }
  };

  const startPlanLimitRepeat = (
    amount: number,
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    stopPlanLimitRepeat();
    adjustPlanRequestLimit(amount);
    planLimitRepeatDelayRef.current = window.setTimeout(() => {
      planLimitRepeatIntervalRef.current = window.setInterval(() => {
        adjustPlanRequestLimit(amount);
      }, 90);
    }, 360);
  };

  const requestPlanUpgrade = async () => {
    const certificateLimit = Number(planRequestForm.certificateLimit);
    if (!Number.isFinite(certificateLimit) || certificateLimit < 1) {
      toast({
        title: "Invalid limit",
        description: "Requested certificate limit must be at least 1.",
        variant: "destructive",
      });
      return;
    }

    if (
      !planRequestForm.upiTransactionId.trim() &&
      !planRequestForm.paymentProofDataUrl
    ) {
      toast({
        title: "Payment proof required",
        description: "Enter a UPI transaction ID or upload a payment screenshot.",
        variant: "destructive",
      });
      return;
    }

    setIsRequestingPlan(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/admin/plan-upgrade-request`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planName: planRequestForm.planName,
          certificateLimit,
          message: planRequestForm.message,
          paymentMethod: planRequestForm.paymentMethod,
          upiTransactionId: planRequestForm.upiTransactionId,
          paymentProofFileName: planRequestForm.paymentProofFileName,
          paymentProofDataUrl: planRequestForm.paymentProofDataUrl,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Could not send plan request.");
      }

      const nextProfile = {
        ...profile,
        plan: data.plan || profile.plan,
        planUpgradeRequest: {
          ...defaultPlanUpgradeRequest,
          ...(data.planUpgradeRequest || {}),
        },
      };
      setProfile(nextProfile);
      localStorage.setItem("adminUser", JSON.stringify(nextProfile));
      toast({
        title: "Plan request sent",
        description: "Super admin can now approve or reject your selected plan.",
      });
    } catch (error: any) {
      toast({
        title: "Request failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRequestingPlan(false);
    }
  };

  const updateBranding = <K extends keyof AdminBranding>(
    key: K,
    value: AdminBranding[K]
  ) => {
    setProfile((current) => ({
      ...current,
      branding: { ...current.branding, [key]: value },
    }));
  };

  const handleImageUpload = async (
    field: keyof Pick<
      AdminBranding,
      "logoDataUrl" | "signatureDataUrl" | "stampDataUrl"
    >,
    file?: File
  ) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid image",
        description: "Please upload a PNG, JPG, or SVG image.",
        variant: "destructive",
      });
      return;
    }

    try {
      updateBranding(field, await fileToDataUrl(file));
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error?.message || "Could not read image file.",
        variant: "destructive",
      });
    }
  };

  const updateInstitutionDocument = (
    type: InstitutionDocument["type"],
    nextDocument?: InstitutionDocument
  ) => {
    setProfile((current) => {
      const remaining = current.institutionDocuments.filter(
        (document) => document.type !== type
      );
      return {
        ...current,
        institutionDocuments: nextDocument
          ? [...remaining, nextDocument]
          : remaining,
      };
    });
  };

  const clearInstitutionDocument = (type: InstitutionDocument["type"]) => {
    if (!canAccessInstitutionBranding || institutionStatus === "suspended") {
      return;
    }

    setIsEditingInstitution(true);
    updateInstitutionDocument(type);
    toast({
      title: "Proof document cleared",
      description: "Click Save Account Settings to keep this change.",
    });
  };

  const handleInstitutionDocumentUpload = async (
    type: InstitutionDocument["type"],
    file?: File
  ) => {
    if (!file) return;
    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid proof document",
        description: "Upload a PDF, PNG, or JPG file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Each proof document must be 5 MB or smaller.",
        variant: "destructive",
      });
      return;
    }

    try {
      updateInstitutionDocument(type, {
        type,
        label: institutionDocumentLabels[type],
        fileName: file.name,
        dataUrl: await fileToDataUrl(file),
        uploadedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error?.message || "Could not read proof document.",
        variant: "destructive",
      });
    }
  };

  const handlePaymentProofUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid screenshot",
        description: "Upload a PNG or JPG payment screenshot.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Screenshot too large",
        description: "Payment screenshot must be 5 MB or smaller.",
        variant: "destructive",
      });
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setPlanRequestForm((current) => ({
        ...current,
        paymentProofFileName: file.name,
        paymentProofDataUrl: dataUrl,
      }));
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error?.message || "Could not read payment screenshot.",
        variant: "destructive",
      });
    }
  };

  const sendPasswordReset = async () => {
    if (!profile.email) return;
    setIsSendingReset(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/admin/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: profile.email }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Could not send password reset email.");
      }
      toast({
        title: "Reset email sent",
        description: data.message || "Check the admin email inbox.",
      });
      setResetCodeSent(true);
    } catch (error: any) {
      toast({
        title: "Reset email failed",
        description: error?.message || "Could not send the reset code. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  const updateResetForm = (field: keyof typeof resetForm, value: string) => {
    setResetForm((current) => ({ ...current, [field]: value }));
  };

  const resetPassword = async () => {
    const code = resetForm.code.trim();
    const password = resetForm.password;
    const confirmPassword = resetForm.confirmPassword;

    if (!code || !password || !confirmPassword) {
      toast({
        title: "Reset details missing",
        description: "Enter the OTP code, new password, and confirm password.",
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

    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "New password and confirm password must be the same.",
        variant: "destructive",
      });
      return;
    }

    setIsResettingPassword(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/admin/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: profile.email,
          code,
          password,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Password reset failed.");
      }

      setResetForm({ code: "", password: "", confirmPassword: "" });
      setResetCodeSent(false);
      toast({
        title: "Password updated",
        description: "Your admin password has been changed successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Password update failed",
        description: error?.message || "Check the OTP and try again.",
        variant: "destructive",
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const formattedCreatedAt = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString()
    : "Not available";

  if (isLoading) {
    return (
      <main className="container mx-auto flex min-h-[70vh] items-center justify-center px-4">
        <div className="flex items-center gap-3 rounded-md border border-border bg-card/80 px-5 py-4 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Loading admin settings...
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-10">
      <section className="mb-8 flex flex-col gap-4 border-b border-border/70 pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="section-kicker mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Admin Settings
          </div>
          <h1 className="text-4xl font-bold text-foreground md:text-5xl">
            Control your issuing workspace
          </h1>
          <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
            Manage your account, institute branding, security, certificate defaults, and dashboard behavior.
          </p>
        </div>
        <Button
          onClick={() => saveProfile()}
          disabled={isSavingProfile}
          className="w-full sm:w-auto"
        >
          {isSavingProfile ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Account Settings
        </Button>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="surface-card xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <Shield className="h-6 w-6 text-primary" />
              Account Profile
            </CardTitle>
            <CardDescription>
              This information identifies the admin who issues certificates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="admin-name">Admin Name</Label>
                <Input
                  id="admin-name"
                  value={profile.name}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Enter admin name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-email">Admin Email</Label>
                <Input id="admin-email" value={profile.email} readOnly />
              </div>
            </div>
            <div className="rounded-md border border-border bg-background/45 p-4">
              <p className="text-sm text-muted-foreground">Account created</p>
              <p className="mt-1 font-semibold text-foreground">{formattedCreatedAt}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <CreditCard className="h-6 w-6 text-primary" />
              Plan Upgrade
            </CardTitle>
            <CardDescription>
              Choose the plan you want and request approval from the super admin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
              <div className="rounded-md border border-border bg-background/45 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Current plan</p>
                    <p className="mt-2 text-2xl font-bold capitalize text-foreground">
                      {profile.plan?.name || "trial"}
                    </p>
                  </div>
                  <span className="rounded-md border border-secondary/35 bg-secondary/10 px-3 py-1 text-sm font-semibold capitalize text-secondary">
                    {profile.plan?.status || "active"}
                  </span>
                </div>
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Certificate usage</span>
                    <span className="font-semibold text-foreground">
                      {planUsed} / {planLimit}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-secondary"
                      style={{ width: `${planUsagePercent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {planRemaining} certificates remaining
                  </p>
                </div>
              </div>

              <div
                className={`rounded-md border p-5 text-sm ${
                  planRequestStatus === "pending"
                    ? "border-primary/35 bg-primary/10 text-primary"
                    : planRequestStatus === "approved"
                      ? "border-secondary/35 bg-secondary/10 text-secondary"
                      : planRequestStatus === "rejected"
                        ? "border-destructive/35 bg-destructive/10 text-destructive"
                        : "border-border bg-background/45 text-muted-foreground"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold capitalize">
                      {planRequestStatus === "none"
                        ? "No active request"
                        : `Request ${planRequestStatus}`}
                    </p>
                    <p className="mt-2 text-muted-foreground">
                      {planRequestStatus === "none"
                        ? "Send payment proof with the plan request for manual approval."
                        : `${profile.planUpgradeRequest?.requestedPlan?.name || "Plan"} - ${
                            profile.planUpgradeRequest?.requestedPlan?.certificateLimit || 0
                          } certificates`}
                    </p>
                  </div>
                  {planRequestStatus !== "none" && (
                    <span className="rounded-md border border-current/25 px-3 py-1 text-xs font-semibold uppercase">
                      {planRequestStatus}
                    </span>
                  )}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {profile.planUpgradeRequest?.payment?.upiTransactionId && (
                    <div className="rounded-md border border-current/20 bg-background/30 p-3">
                      <p className="text-xs uppercase text-muted-foreground">
                        UPI reference
                      </p>
                      <p className="mt-1 break-all font-semibold text-foreground">
                        {profile.planUpgradeRequest.payment.upiTransactionId}
                      </p>
                    </div>
                  )}
                  {profile.planUpgradeRequest?.payment?.proofFileName && (
                    <div className="rounded-md border border-current/20 bg-background/30 p-3">
                      <p className="text-xs uppercase text-muted-foreground">
                        Screenshot
                      </p>
                      <p className="mt-1 break-all font-semibold text-foreground">
                        {profile.planUpgradeRequest.payment.proofFileName}
                      </p>
                    </div>
                  )}
                </div>
                {profile.planUpgradeRequest?.responseNote && (
                  <p className="mt-4 text-muted-foreground">
                    {profile.planUpgradeRequest.responseNote}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-border bg-background/35 p-5">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-foreground">Upgrade request</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choose a plan, add payment details, and send it for super admin approval.
                  </p>
                </div>
                {(planRequestForm.paymentProofDataUrl ||
                  planRequestForm.paymentProofFileName) && (
                  <span className="inline-flex items-center rounded-md border border-secondary/35 bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
                    Proof attached
                  </span>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>Choose Plan</Label>
                  <Select
                    value={planRequestForm.planName}
                    onValueChange={updatePlanRequestName}
                  >
                    <SelectTrigger className="bg-background/70">
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {planOptions.map((plan) => (
                        <SelectItem key={plan.value} value={plan.value}>
                          {plan.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-limit">Certificate Limit</Label>
                  {isCustomPlanRequest ? (
                    <div className="relative">
                      <Input
                        id="plan-limit"
                        type="number"
                        min="1"
                        value={planRequestForm.certificateLimit}
                        onChange={(event) =>
                          setPlanRequestForm((current) => ({
                            ...current,
                            certificateLimit: event.target.value,
                          }))
                        }
                        className="theme-number-input bg-background/70 pr-11"
                      />
                      <div className="absolute bottom-1 right-1 top-1 flex w-8 flex-col overflow-hidden rounded-md border border-border bg-muted/80">
                        <button
                          type="button"
                          aria-label="Increase certificate limit"
                          className="flex flex-1 touch-none select-none items-center justify-center text-muted-foreground transition-colors hover:bg-secondary/15 hover:text-secondary"
                          onPointerDown={(event) => startPlanLimitRepeat(1, event)}
                          onPointerUp={stopPlanLimitRepeat}
                          onPointerCancel={stopPlanLimitRepeat}
                          onPointerLeave={stopPlanLimitRepeat}
                          onBlur={stopPlanLimitRepeat}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              adjustPlanRequestLimit(1);
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
                          onPointerDown={(event) => startPlanLimitRepeat(-1, event)}
                          onPointerUp={stopPlanLimitRepeat}
                          onPointerCancel={stopPlanLimitRepeat}
                          onPointerLeave={stopPlanLimitRepeat}
                          onBlur={stopPlanLimitRepeat}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              adjustPlanRequestLimit(-1);
                            }
                          }}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Input
                      id="plan-limit"
                      value={`${planRequestForm.certificateLimit} certificates`}
                      readOnly
                      className="bg-background/70 text-muted-foreground"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upi-transaction-id">UPI Transaction ID</Label>
                  <Input
                    id="upi-transaction-id"
                    value={planRequestForm.upiTransactionId}
                    onChange={(event) =>
                      setPlanRequestForm((current) => ({
                        ...current,
                        upiTransactionId: event.target.value,
                      }))
                    }
                    placeholder="UPI reference / transaction ID"
                    className="bg-background/70"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-screenshot">Payment Screenshot</Label>
                  <label
                    htmlFor="payment-screenshot"
                    className="flex h-10 w-full cursor-pointer items-center justify-center rounded-md border border-primary/35 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload proof
                  </label>
                  <Input
                    id="payment-screenshot"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      handlePaymentProofUpload(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </div>
              </div>

              {(planRequestForm.paymentProofDataUrl ||
                planRequestForm.paymentProofFileName) && (
                <div className="mt-4 rounded-md border border-secondary/30 bg-secondary/10 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">
                        Payment proof attached
                      </p>
                      <p className="break-all text-muted-foreground">
                        {planRequestForm.paymentProofFileName || "Screenshot uploaded"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {planRequestForm.paymentProofDataUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const opened = openDataUrlPreview(
                              planRequestForm.paymentProofDataUrl,
                              planRequestForm.paymentProofFileName ||
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
                          View
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          setPlanRequestForm((current) => ({
                            ...current,
                            paymentProofFileName: "",
                            paymentProofDataUrl: "",
                          }))
                        }
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
                <div className="space-y-2">
                  <Label htmlFor="plan-message">Message to Super Admin</Label>
                  <Textarea
                    id="plan-message"
                    value={planRequestForm.message}
                    onChange={(event) =>
                      setPlanRequestForm((current) => ({
                        ...current,
                        message: event.target.value,
                      }))
                    }
                    placeholder="Tell the super admin why you need this plan."
                    className="min-h-[104px] bg-background/70"
                  />
                </div>
                <div className="flex flex-col justify-between rounded-md border border-border bg-card/45 p-4">
                  <p className="text-sm text-muted-foreground">
                    Add a UPI reference or payment screenshot before sending the request.
                  </p>
                  <Button
                    type="button"
                    onClick={requestPlanUpgrade}
                    disabled={isRequestingPlan}
                    className="mt-4 w-full"
                  >
                    {isRequestingPlan ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                    {planRequestStatus === "pending"
                      ? "Update Plan Request"
                      : "Request Plan Upgrade"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card xl:col-span-2">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-3 text-2xl">
                <Building2 className="h-6 w-6 text-primary" />
                Institute Branding
              </CardTitle>
              <CardDescription>
                Add institute identity once, then use it on certificate PDFs and student emails.
              </CardDescription>
            </div>
            {canAccessInstitutionBranding && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canRequestInstitutionApproval}
                  className={cn(
                    "font-semibold",
                    isInstitutionVerified &&
                      !isEditingInstitution &&
                      "border border-emerald-300 bg-emerald-500 text-emerald-950 shadow-sm hover:bg-emerald-500 disabled:opacity-100",
                    isVerifiedInstitutionEdit &&
                      "border border-amber-300 bg-amber-400 text-amber-950 shadow-sm hover:bg-amber-300",
                    isInstitutionPending &&
                      "border border-sky-300 bg-sky-500 text-sky-950 shadow-sm hover:bg-sky-500 disabled:opacity-100"
                  )}
                  onClick={() => saveProfile({ requestInstitutionApproval: true })}
                >
                  {isSavingProfile ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4" />
                  )}
                  {institutionApprovalLabel}
                </Button>
                {isEditingInstitution ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsEditingInstitution(false)}
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-card/80"
                    disabled={isInstitutionSuspended}
                    onClick={() => setIsEditingInstitution(true)}
                  >
                    <PenLine className="h-4 w-4" />
                    Edit
                  </Button>
                )}
                {institutionApprovalHint && (
                  <p className="basis-full text-xs text-muted-foreground sm:max-w-sm sm:text-right">
                    {institutionApprovalHint}
                  </p>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {!canAccessInstitutionBranding ? (
              <div className="rounded-md border border-primary/30 bg-primary/10 p-5">
                <p className="font-semibold text-foreground">
                  Institution branding is locked for trial accounts
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Trial admins can issue 5 certificates without institution approval.
                  Request a plan upgrade before adding institute branding for super
                  admin verification.
                </p>
              </div>
            ) : (
              <>
                <div
                  className={`flex items-start gap-3 rounded-md border p-4 ${institutionStatusClass(
                    institutionStatus
                  )}`}
                >
                  {institutionStatus === "verified" ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5" />
                  ) : institutionStatus === "rejected" || institutionStatus === "suspended" ? (
                    <Ban className="mt-0.5 h-5 w-5" />
                  ) : (
                    <Shield className="mt-0.5 h-5 w-5" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {institutionStatusLabels[institutionStatus]}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {isEditingInstitution
                        ? "Editing is enabled. Use Approval to send these details for super admin review."
                        : institutionStatus === "verified"
                          ? "Super admin has approved this institute identity. Click Edit to request a reviewed change."
                          : institutionStatus === "pending"
                            ? "Super admin must verify this institution before certificates can be issued beyond trial."
                            : institutionStatus === "rejected"
                              ? "Click Edit, update the institute identity, then use Approval to request another review."
                              : institutionStatus === "suspended"
                                ? "Certificate issuing is blocked until the super admin restores this institution."
                                : "Click Edit to add the institution identity, then use Approval to request super admin verification."}
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="institute-name">Institute Name</Label>
                    <Input
                      id="institute-name"
                      value={profile.branding.instituteName}
                      disabled={institutionFieldsDisabled}
                      onChange={(event) =>
                        updateBranding("instituteName", event.target.value)
                      }
                      placeholder="Enter institute name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="institute-website">Website</Label>
                    <Input
                      id="institute-website"
                      value={profile.branding.instituteWebsite}
                      disabled={institutionFieldsDisabled}
                      onChange={(event) =>
                        updateBranding("instituteWebsite", event.target.value)
                      }
                      placeholder="https://example.edu"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="institute-address">Address / Subtitle</Label>
                  <Textarea
                    id="institute-address"
                    value={profile.branding.instituteAddress}
                    disabled={institutionFieldsDisabled}
                    onChange={(event) =>
                      updateBranding("instituteAddress", event.target.value)
                    }
                    placeholder="University, department, address, or affiliation"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <BrandImagePicker
                    title="Institute Logo"
                    image={profile.branding.logoDataUrl}
                    disabled={institutionFieldsDisabled}
                    onFile={(file) => handleImageUpload("logoDataUrl", file)}
                    onClear={() => updateBranding("logoDataUrl", "")}
                  />
                  <BrandImagePicker
                    title="Signature"
                    image={profile.branding.signatureDataUrl}
                    disabled={institutionFieldsDisabled}
                    onFile={(file) => handleImageUpload("signatureDataUrl", file)}
                    onClear={() => updateBranding("signatureDataUrl", "")}
                  />
                  <BrandImagePicker
                    title="Stamp"
                    image={profile.branding.stampDataUrl}
                    disabled={institutionFieldsDisabled}
                    onFile={(file) => handleImageUpload("stampDataUrl", file)}
                    onClear={() => updateBranding("stampDataUrl", "")}
                  />
                </div>
                <div className="rounded-md border border-border bg-background/35 p-4">
                  <div className="mb-4">
                    <p className="flex items-center gap-2 font-semibold text-foreground">
                      <FileCheck className="h-5 w-5 text-primary" />
                      Verification proof documents
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Upload both documents before requesting super admin approval.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <InstitutionDocumentPicker
                      title="Registration certificate"
                      document={profile.institutionDocuments.find(
                        (item) => item.type === "registration_certificate"
                      )}
                      disabled={institutionFieldsDisabled}
                      clearDisabled={
                        !canAccessInstitutionBranding ||
                        institutionStatus === "suspended" ||
                        isSavingProfile
                      }
                      onFile={(file) =>
                        handleInstitutionDocumentUpload("registration_certificate", file)
                      }
                      onClear={() => clearInstitutionDocument("registration_certificate")}
                    />
                    <InstitutionDocumentPicker
                      title="Authorization letter"
                      document={profile.institutionDocuments.find(
                        (item) => item.type === "authorization_letter"
                      )}
                      disabled={institutionFieldsDisabled}
                      clearDisabled={
                        !canAccessInstitutionBranding ||
                        institutionStatus === "suspended" ||
                        isSavingProfile
                      }
                      onFile={(file) =>
                        handleInstitutionDocumentUpload("authorization_letter", file)
                      }
                      onClear={() => clearInstitutionDocument("authorization_letter")}
                    />
                  </div>
                  {!hasRequiredInstitutionDocuments && (
                    <p className="mt-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-muted-foreground">
                      Upload both proof documents before sending for approval.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="surface-card xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <PenLine className="h-6 w-6 text-primary" />
              Certificate Template Builder
            </CardTitle>
            <CardDescription>
              Customize the certificate title, body line, footer, and brand colors.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="certificate-title">Certificate Title</Label>
                <Input
                  id="certificate-title"
                  value={profile.branding.certificateTitle}
                  onChange={(event) =>
                    updateBranding("certificateTitle", event.target.value)
                  }
                  placeholder="Certificate of Completion"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="certificate-footer">Footer Text</Label>
                <Input
                  id="certificate-footer"
                  value={profile.branding.certificateFooter}
                  onChange={(event) =>
                    updateBranding("certificateFooter", event.target.value)
                  }
                  placeholder="Authorized by Blockchain Certificate System"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="certificate-body">Certificate Body Line</Label>
              <Textarea
                id="certificate-body"
                value={profile.branding.certificateBody}
                onChange={(event) =>
                  updateBranding("certificateBody", event.target.value)
                }
                placeholder="has successfully completed the course"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="surface-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <FileCheck className="h-6 w-6 text-primary" />
              Certificate Defaults
            </CardTitle>
            <CardDescription>
              Save the default behavior you want while issuing certificates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Default Template</Label>
                <Select
                  value={normalizeCertificateTemplate(preferences.defaultTemplate)}
                  onValueChange={(value) =>
                    updatePreference("defaultTemplate", normalizeCertificateTemplate(value))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completion">Course Completion</SelectItem>
                    <SelectItem value="internship">Internship</SelectItem>
                    <SelectItem value="participation">Participation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Export Format</Label>
                <Select
                  value={preferences.exportFormat}
                  onValueChange={(value) => updatePreference("exportFormat", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xlsx">Excel workbook</SelectItem>
                    <SelectItem value="csv">CSV file</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <ToggleRow
                icon={<Mail className="h-5 w-5" />}
                title="Auto-send student email"
                description="Keep email delivery enabled after each certificate is issued."
                checked={preferences.autoSendEmail}
                onCheckedChange={(checked) => updatePreference("autoSendEmail", checked)}
              />
              <ToggleRow
                icon={<Eye className="h-5 w-5" />}
                title="Include protected verify link"
                description="Add an admin-login verification link inside certificate email messages."
                checked={preferences.includePublicVerifyLink}
                onCheckedChange={(checked) =>
                  updatePreference("includePublicVerifyLink", checked)
                }
              />
              <ToggleRow
                icon={<CheckCircle2 className="h-5 w-5" />}
                title="Show transaction progress"
                description="Keep the dashboard progress status visible while chain/email jobs run."
                checked={preferences.showChainProgress}
                onCheckedChange={(checked) => updatePreference("showChainProgress", checked)}
              />
            </div>

            <Button type="button" onClick={savePreferences} variant="secondary">
              <Save className="h-4 w-4" />
              Save Display Settings
            </Button>
          </CardContent>
        </Card>

        <Card className="surface-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <MonitorCog className="h-6 w-6 text-primary" />
              Dashboard & Security
            </CardTitle>
            <CardDescription>
              Tune your dashboard view and manage account access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-md border border-border bg-background/45 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <KeyRound className="h-5 w-5 text-primary" />
                    Password Reset
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Send a reset code to {profile.email || "the admin email"}.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={sendPasswordReset}
                  disabled={isSendingReset}
                >
                  {isSendingReset ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Send Reset Code
                </Button>
              </div>
              <div className="mt-5 grid gap-4">
                {resetCodeSent && (
                  <div className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-primary">
                    Reset OTP sent. Check your email, then enter the code and new password below.
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="settings-reset-code">Email OTP</Label>
                  <Input
                    id="settings-reset-code"
                    inputMode="numeric"
                    placeholder="Enter 6-digit OTP"
                    value={resetForm.code}
                    onChange={(event) => updateResetForm("code", event.target.value)}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="settings-new-password">New Password</Label>
                    <div className="relative">
                      <Input
                        id="settings-new-password"
                        type={showResetPassword ? "text" : "password"}
                        placeholder="Enter new password"
                        value={resetForm.password}
                        onChange={(event) =>
                          updateResetForm("password", event.target.value)
                        }
                        className="pr-12"
                      />
                      <button
                        type="button"
                        aria-label={showResetPassword ? "Hide password" : "Show password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-primary"
                        onClick={() => setShowResetPassword((current) => !current)}
                      >
                        {showResetPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-confirm-password">Confirm Password</Label>
                    <Input
                      id="settings-confirm-password"
                      type={showResetPassword ? "text" : "password"}
                      placeholder="Re-enter new password"
                      value={resetForm.confirmPassword}
                      onChange={(event) =>
                        updateResetForm("confirmPassword", event.target.value)
                      }
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={resetPassword}
                  disabled={isResettingPassword}
                  className="w-full sm:w-fit"
                >
                  {isResettingPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  Update Password
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-border bg-background/45 p-4">
              <p className="text-sm font-semibold text-foreground">Session</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Settings are tied to this admin login. Sign out before sharing this device.
              </p>
              <Button
                type="button"
                variant="destructive"
                className="mt-4"
                onClick={() => {
                  localStorage.removeItem("adminToken");
                  localStorage.removeItem("adminUser");
                  navigate("/admin/login");
                }}
              >
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
};

interface ToggleRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
}) => (
  <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background/45 p-4">
    <div className="flex min-w-0 items-start gap-3">
      <div className="mt-1 text-primary">{icon}</div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </div>
);

interface BrandImagePickerProps {
  title: string;
  image: string;
  disabled?: boolean;
  onFile: (file?: File) => void;
  onClear: () => void;
}

const BrandImagePicker: React.FC<BrandImagePickerProps> = ({
  title,
  image,
  disabled = false,
  onFile,
  onClear,
}) => {
  const inputId = React.useId();

  return (
    <div className="rounded-md border border-border bg-background/45 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Stamp className="h-4 w-4 text-primary" />
          {title}
        </div>
        {image && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="text-xs font-semibold text-muted-foreground transition-colors hover:text-destructive"
          >
            Clear
          </button>
        )}
      </div>
      <label
        htmlFor={inputId}
        className={`mb-3 flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-card/70 transition-colors ${
          disabled
            ? "cursor-not-allowed opacity-70"
            : "cursor-pointer hover:border-primary/60 hover:bg-primary/10"
        }`}
        title={`Upload ${title}`}
      >
        {image ? (
          <img
            src={image}
            alt={title}
            draggable={false}
            className="max-h-20 max-w-full object-contain"
          />
        ) : (
          <Upload className="h-7 w-7 text-muted-foreground" />
        )}
      </label>
      <Input
        id={inputId}
        type="file"
        accept="image/*"
        disabled={disabled}
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
};

interface InstitutionDocumentPickerProps {
  title: string;
  document?: InstitutionDocument;
  disabled?: boolean;
  clearDisabled?: boolean;
  onFile: (file?: File) => void;
  onClear: () => void;
}

const InstitutionDocumentPicker: React.FC<InstitutionDocumentPickerProps> = ({
  title,
  document,
  disabled = false,
  clearDisabled = disabled,
  onFile,
  onClear,
}) => {
  const inputId = React.useId();

  return (
    <div className="rounded-md border border-border bg-card/55 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <FileText className="h-4 w-4 text-primary" />
          {title}
        </div>
        {document?.dataUrl && (
          <button
            type="button"
            onClick={onClear}
            disabled={clearDisabled}
            className="text-xs font-semibold text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>
      <label
        htmlFor={inputId}
        className={`flex min-h-24 items-center justify-center rounded-md border border-dashed border-border bg-background/65 p-4 text-center transition-colors ${
          disabled
            ? "cursor-not-allowed opacity-70"
            : "cursor-pointer hover:border-primary/60 hover:bg-primary/10"
        }`}
      >
        {document?.dataUrl ? (
          <div>
            <FileCheck className="mx-auto mb-2 h-7 w-7 text-secondary" />
            <p className="break-all text-sm font-semibold text-foreground">
              {document.fileName || "Proof document uploaded"}
            </p>
            <a
              href={document.dataUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs font-semibold text-primary underline"
              onClick={(event) => event.stopPropagation()}
            >
              View document
            </a>
          </div>
        ) : (
          <div>
            <Upload className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Upload PDF, PNG, or JPG</p>
          </div>
        )}
      </label>
      <Input
        id={inputId}
        type="file"
        accept=".pdf,image/png,image/jpeg"
        disabled={disabled}
        className="mt-3"
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
};

export default AdminSettings;

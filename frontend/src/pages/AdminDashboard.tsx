import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  CalendarDays,
  Copy,
  Download,
  Eye,
  FileCheck,
  FileSearch,
  Loader2,
  Mail,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Shield,
  Trophy,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  getCertificateTemplateLabel,
  loadAdminPreferences,
  normalizeCertificateTemplate,
} from "@/utils/adminSettings";
import { getApiBaseUrl } from "@/utils/api";
import { generateFileHash } from "@/utils/hash";
import { generateCertificatePDF } from "@/utils/pdfGenerator";
import { uploadFileToPinata, uploadMetadataToPinata } from "@/utils/pinata";
import { isDateAfter, isDateOnOrBefore, parseDateOnly, toDateOnlyString } from "@/utils/dateOnly";
import { ADMIN_USER_REFRESH_EVENT, saveAdminUserSession } from "@/utils/adminSession";

interface Certificate {
  certificateId: string;
  chainCertificateId?: string;
  studentName: string;
  studentEmail?: string;
  courseName: string;
  issueDate: string;
  expiryDate?: string;
  template?: string;
  ipfsPdfHash: string;
  blockchainTx: string;
  chainStatus?: "pending" | "confirmed" | "failed";
  chainError?: string;
  emailStatus?: string;
  emailSentAt?: string;
  emailError?: string;
  emailHistory?: Array<{
    status: string;
    message?: string;
    sentAt?: string;
    action?: string;
  }>;
  issuedBy: string;
  issuerWalletAddress?: string;
  certificateText?: string;
  brandingSnapshot?: Record<string, string>;
  editedAt?: string;
  editedBy?: string;
  editNote?: string;
  revoked?: boolean;
  revokedAt?: string;
  revokeTx?: string;
}

interface DashboardStats {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  thisMonth: number;
  courseBreakdown?: Array<{ courseName: string; count: number }>;
  emailStats?: Array<{ status: string; count: number }>;
  monthlyIssued?: Array<{ year: number; month: number; count: number }>;
  revokedTrend?: Array<{ year: number; month: number; count: number }>;
  mostIssuedCourse: string;
  mostIssuedCourseCount: number;
  lastIssuedCertificate: {
    certificateId: string;
    studentName: string;
    studentEmail?: string;
    courseName: string;
    issueDate: string;
    chainStatus?: string;
    emailStatus?: string;
    revoked?: boolean;
  } | null;
}

const emptyStats: DashboardStats = {
  total: 0,
  active: 0,
  revoked: 0,
  expired: 0,
  thisMonth: 0,
  courseBreakdown: [],
  emailStats: [],
  monthlyIssued: [],
  revokedTrend: [],
  mostIssuedCourse: "None",
  mostIssuedCourseCount: 0,
  lastIssuedCertificate: null,
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read corrected certificate PDF."));
    reader.readAsDataURL(file);
  });

const parseDateValue = (value: string) => {
  return parseDateOnly(value) || undefined;
};

const toDateValue = (date: Date) => {
  return toDateOnlyString(date);
};

const formatDateButtonLabel = (value: string, fallback = "dd-mm-yyyy") => {
  const date = parseDateValue(value);
  return date ? format(date, "dd MMM yyyy") : fallback;
};

const institutionStatusLabels: Record<string, string> = {
  unverified: "Institution not submitted",
  pending: "Institution pending review",
  verified: "Institution verified",
  rejected: "Institution rejected",
  suspended: "Institution suspended",
};

const institutionStatusClass = (status = "unverified") => {
  if (status === "verified") return "text-secondary";
  if (status === "pending") return "text-primary";
  if (status === "rejected" || status === "suspended") return "text-destructive";
  return "text-muted-foreground";
};

const AUTO_REFRESH_INTERVAL_MS = 15000;

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [isLoading, setIsLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<{
    _id?: string;
    name: string;
    email: string;
    role?: string;
    walletAddress?: string;
    institutionVerification?: {
      status?: string;
      locked?: boolean;
    };
    planUpgradeRequest?: {
      status?: string;
      requestedPlan?: {
        name?: string;
        certificateLimit?: number;
      };
    };
    plan?: {
      name?: string;
      status?: string;
      certificateLimit?: number;
      issuedCount?: number;
      remaining?: number;
      expiresAt?: string;
    };
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [editingCert, setEditingCert] = useState<Certificate | null>(null);
  const [editForm, setEditForm] = useState({
    studentName: "",
    studentEmail: "",
    courseName: "",
    issueDate: "",
    expiryDate: "",
    template: "completion",
    editNote: "",
  });
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [savingEditStep, setSavingEditStep] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState<
    "from" | "to" | "edit" | "editExpiry" | null
  >(null);

  const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

  const token = useMemo(() => localStorage.getItem("adminToken"), []);
  const adminPreferences = useMemo(loadAdminPreferences, []);
  const compactDashboardList = adminPreferences.compactDashboard === true;
  const exportFormat = adminPreferences.exportFormat === "csv" ? "csv" : "xlsx";
  const autoSendEmail = adminPreferences.autoSendEmail !== false;
  const includePublicVerifyLink = adminPreferences.includePublicVerifyLink !== false;
  const isSuperAdminView = adminUser?.role === "super_admin";

  const buildCertificateVerifyPath = (certificateId: string) =>
    `/verify/${encodeURIComponent(certificateId)}`;

  const buildCertificateVerifyUrl = (certificateId: string) =>
    `${window.location.origin}${buildCertificateVerifyPath(certificateId)}`;

  const getAdminBranding = () => {
    try {
      const adminUser = JSON.parse(localStorage.getItem("adminUser") || "{}");
      return adminUser.branding || {};
    } catch {
      return {};
    }
  };

  useEffect(() => {
    if (!token) {
      toast({
        title: "Unauthorized",
        description: "Please log in to access the dashboard.",
        variant: "destructive",
      });
      navigate("/admin/login");
      return;
    }

    const savedUser = localStorage.getItem("adminUser");
    if (savedUser) {
      try {
        setAdminUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("adminUser");
      }
    }

    fetchAdminProfile(token);
    fetchStats(token);
    fetchCertificates({ authToken: token, pageToLoad: 1 });
  }, [navigate, token]);

  useEffect(() => {
    if (!token) return;

    const intervalId = window.setInterval(() => {
      if (
        document.visibilityState !== "visible" ||
        savingEditId ||
        revokingId ||
        resendingId
      ) {
        return;
      }

      void fetchStats(token, { silent: true });
      void fetchCertificates({
        authToken: token,
        pageToLoad: page,
        silent: true,
      });
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [
    fromDate,
    page,
    resendingId,
    revokingId,
    savingEditId,
    searchQuery,
    statusFilter,
    toDate,
    token,
  ]);

  useEffect(() => {
    const syncAdminUser = (event: Event) => {
      const refreshedUser = (event as CustomEvent).detail;
      if (refreshedUser) {
        setAdminUser(refreshedUser);
        return;
      }

      try {
        const savedUser = localStorage.getItem("adminUser");
        if (savedUser) {
          setAdminUser(JSON.parse(savedUser));
        }
      } catch {
        localStorage.removeItem("adminUser");
      }
    };

    window.addEventListener(ADMIN_USER_REFRESH_EVENT, syncAdminUser);
    return () => window.removeEventListener(ADMIN_USER_REFRESH_EVENT, syncAdminUser);
  }, []);

  const authHeaders = (authToken?: string) => ({
    Authorization: `Bearer ${authToken ?? token ?? ""}`,
    "Content-Type": "application/json",
  });

  const fetchAdminProfile = async (authToken: string) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/admin/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.status === 401) {
        toast({
          title: "Session expired",
          description: "Please log in again.",
          variant: "destructive",
        });
        localStorage.clear();
        navigate("/admin/login");
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const user = {
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
        };
        setAdminUser(user);
        saveAdminUserSession(user);
      }
    } catch (err) {
      console.error("fetchAdminProfile error:", err);
    }
  };

  const fetchStats = async (
    authToken?: string,
    options: { silent?: boolean } = {}
  ) => {
    const { silent = false } = options;
    if (!silent) {
      setIsStatsLoading(true);
    }
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/issue/stats`, {
        headers: authHeaders(authToken),
      });

      if (!res.ok) {
        throw new Error("Failed to fetch analytics");
      }

      const payload = await res.json();
      setStats(payload.stats ?? emptyStats);
    } catch (err) {
      console.error("Stats load error:", err);
      if (!silent) {
        setStats(emptyStats);
      }
    } finally {
      if (!silent) {
        setIsStatsLoading(false);
      }
    }
  };

  const buildQuery = (pageToLoad: number) => {
    const params = new URLSearchParams({
      page: String(pageToLoad),
      limit: "10",
    });

    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);

    return params.toString();
  };

  const fetchCertificates = async ({
    authToken,
    pageToLoad = page,
    silent = false,
  }: {
    authToken?: string;
    pageToLoad?: number;
    silent?: boolean;
  } = {}) => {
    if (!silent) {
      setIsLoading(true);
      setLoadError(null);
    }

    try {
      const res = await fetch(
        `${getApiBaseUrl()}/api/issue/all?${buildQuery(pageToLoad)}`,
        {
          headers: authHeaders(authToken),
        }
      );

      if (!res.ok) throw new Error("Failed to fetch certificates");

      const payload = await res.json();
      setCertificates(payload.certificates ?? []);
      setTotalPages(payload.totalPages || 1);
      setTotalResults(payload.total || 0);
      setPage(payload.page || pageToLoad);
    } catch (err) {
      console.error("Error fetching certificates:", err);
      if (!silent) {
        setCertificates([]);
        setLoadError("Could not load certificate data. Please refresh and try again.");
        toast({
          title: "Failed to load certificates",
          description: "Only live certificate data is shown.",
          variant: "destructive",
        });
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  const refreshDashboard = async () => {
    await Promise.all([
      token ? fetchAdminProfile(token) : Promise.resolve(),
      fetchStats(),
      fetchCertificates({ pageToLoad: page }),
    ]);
  };

  const applyFilters = () => {
    fetchCertificates({ pageToLoad: 1 });
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
    window.setTimeout(() => fetchCertificates({ pageToLoad: 1 }), 0);
  };

  const handleViewPDF = (ipfsHash: string) => {
    if (!ipfsHash) {
      toast({
        title: "No PDF available",
        description: "This certificate does not have a PDF file available.",
        variant: "destructive",
      });
      return;
    }
    window.open(`${IPFS_GATEWAY}${ipfsHash}`, "_blank");
  };

  const copyPublicLink = async (certificateId: string) => {
    const link = buildCertificateVerifyUrl(certificateId);
    await navigator.clipboard.writeText(link);
    toast({
      title: "Public link copied",
      description: link,
    });
  };

  const handleResendEmail = async (cert: Certificate) => {
    if (!cert.studentEmail) {
      toast({
        title: "No student email",
        description: "This certificate has no student email saved.",
        variant: "destructive",
      });
      return;
    }

    setResendingId(cert.certificateId);
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/api/issue/${cert.certificateId}/resend-email`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ includePublicVerifyLink }),
        }
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || "Failed to resend certificate email.");
      }

      toast({
        title: "Email queued",
        description: `Certificate email will be sent to ${cert.studentEmail}.`,
      });
      await refreshDashboard();
    } catch (err: any) {
      toast({
        title: "Resend failed",
        description: err?.message || "Could not resend certificate email.",
        variant: "destructive",
      });
    } finally {
      setResendingId(null);
    }
  };

  const startEdit = (cert: Certificate) => {
    setEditingCert(cert);
    setEditForm({
      studentName: cert.studentName,
      studentEmail: cert.studentEmail || "",
      courseName: cert.courseName,
      issueDate: cert.issueDate,
      expiryDate: cert.expiryDate || "",
      template: normalizeCertificateTemplate(cert.template || "completion"),
      editNote: "",
    });
  };

  const cancelEdit = () => {
    if (savingEditId) return;

    setEditingCert(null);
    setSavingEditId(null);
    setSavingEditStep("");
    setDatePickerOpen(null);
  };

  const saveEdit = async () => {
    if (!editingCert) return;

    const confirmed = window.confirm(
      `Reissue certificate ${editingCert.certificateId}? The platform wallet will revoke the old proof and issue the corrected certificate.`
    );

    if (!confirmed) return;

    setSavingEditId(editingCert.certificateId);
    setSavingEditStep("Preparing corrected PDF...");
    try {
      const correctedData = {
        studentName: editForm.studentName.trim(),
        studentEmail: editForm.studentEmail.trim(),
        courseName: editForm.courseName.trim(),
        issueDate: editForm.issueDate,
        expiryDate: editForm.expiryDate,
        template: editForm.template,
        branding: editingCert.brandingSnapshot || getAdminBranding(),
        certificateText:
          editingCert.certificateText ||
          (editingCert.brandingSnapshot || getAdminBranding()).certificateBody ||
          "",
      };

      if (
        !correctedData.studentName ||
        !correctedData.studentEmail ||
        !correctedData.courseName ||
        !correctedData.issueDate
      ) {
        throw new Error("Student name, email, course, and issue date are required.");
      }

      if (
        correctedData.expiryDate &&
        !isDateAfter(correctedData.expiryDate, correctedData.issueDate)
      ) {
        throw new Error("Expiry date must be after the issue date.");
      }

      const pdf = await generateCertificatePDF(correctedData, editingCert.certificateId);
      const fileName = `${correctedData.studentName.replace(/\s+/g, "_")}_Certificate.pdf`;

      setSavingEditStep("Uploading corrected certificate proof...");
      const [hash, pdfCid] = await Promise.all([
        generateFileHash(pdf),
        uploadFileToPinata(pdf),
      ]);

      const metadataCid = await uploadMetadataToPinata({
        ...correctedData,
        certificateId: editingCert.certificateId,
        fileName,
        fileHash: hash,
        ipfsPdfHash: pdfCid,
        reissueOf: editingCert.ipfsPdfHash,
      });

      setSavingEditStep("Submitting corrected proof to the platform wallet...");
      const pdfBase64 = await fileToBase64(pdf);
      const reissueResponse = await fetch(
        `${getApiBaseUrl()}/api/issue/${editingCert.certificateId}/reissue`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            ...correctedData,
            editNote: editForm.editNote,
            ipfsPdfHash: pdfCid,
            pdfFileName: fileName,
            pdfBase64,
            fileHash: hash,
            metadataCid,
            sendEmail: autoSendEmail,
            includePublicVerifyLink,
          }),
        }
      );
      const reissuePayload = await reissueResponse.json().catch(() => null);
      if (!reissueResponse.ok) {
        throw new Error(reissuePayload?.message || "Failed to save reissued certificate.");
      }

      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Certificate reissued",
        description:
          reissuePayload?.email?.queued
            ? `Certificate ${editingCert.certificateId} was reissued. Email will send after chain confirmation.`
            : `Certificate ${editingCert.certificateId} was reissued with the platform wallet.`,
      });
      setEditingCert(null);
      setDatePickerOpen(null);
      await refreshDashboard();
    } catch (err: any) {
      toast({
        title: "Reissue failed",
        description: err?.message || "Could not reissue certificate.",
        variant: "destructive",
      });
    } finally {
      setSavingEditId(null);
      setSavingEditStep("");
    }
  };

  const exportText = (value: unknown, fallback = "-") => {
    const text = String(value ?? "").trim();
    return text || fallback;
  };

  const escapeExcelHtml = (value: unknown) =>
    exportText(value, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const titleCaseStatus = (value?: string) => {
    const clean = exportText(value, "")
      .replace(/_/g, " ")
      .replace(/-/g, " ")
      .toLowerCase();

    return clean
      ? clean.replace(/\b\w/g, (letter) => letter.toUpperCase())
      : "-";
  };

  const formatTemplateLabel = (value?: string) => getCertificateTemplateLabel(value);

  const formatExportDate = (value?: string) => {
    const date = parseDateValue(value || "");
    return date ? format(date, "dd MMM yyyy") : "-";
  };

  const exportCell = (
    value: unknown,
    className = "text-cell",
    options: { link?: string } = {}
  ) => {
    const content = escapeExcelHtml(value);
    const display = content || "-";

    if (options.link) {
      return `<td class="${className}"><a href="${escapeExcelHtml(options.link)}">${display}</a></td>`;
    }

    return `<td class="${className}">${display}</td>`;
  };

  const buildExcelExportHtml = (rows: Certificate[]) => {
    const generatedAt = format(new Date(), "dd MMM yyyy, hh:mm a");
    const activeCount = rows.filter((cert) => !cert.revoked).length;
    const revokedCount = rows.filter((cert) => cert.revoked).length;
    const filterSummary = [
      searchQuery.trim() ? `Search: ${searchQuery.trim()}` : "",
      statusFilter !== "all" ? `Status: ${titleCaseStatus(statusFilter)}` : "",
      fromDate ? `From: ${formatExportDate(fromDate)}` : "",
      toDate ? `To: ${formatExportDate(toDate)}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    const tableRows = rows
      .map((cert, index) => {
        const verificationUrl = buildCertificateVerifyUrl(cert.certificateId);
        const pdfUrl = cert.ipfsPdfHash ? `${IPFS_GATEWAY}${cert.ipfsPdfHash}` : "";
        const recordStatus = cert.revoked ? "Revoked" : "Active";
        const recordStatusClass = cert.revoked ? "status-revoked" : "status-active";
        const chainStatus = titleCaseStatus(cert.chainStatus || "confirmed");
        const emailStatus = emailStatusMeta(cert).label;

        return `<tr>
          ${exportCell(index + 1, "number-cell")}
          ${exportCell(cert.certificateId)}
          ${exportCell(cert.studentName)}
          ${exportCell(cert.studentEmail)}
          ${exportCell(cert.courseName, "wide-cell")}
          ${exportCell(formatTemplateLabel(cert.template))}
          ${exportCell(formatExportDate(cert.issueDate), "date-cell")}
          ${exportCell(recordStatus, recordStatusClass)}
          ${exportCell(chainStatus)}
          ${exportCell(emailStatus)}
          ${exportCell(verificationUrl, "link-cell", { link: verificationUrl })}
          ${exportCell(pdfUrl, "link-cell", { link: pdfUrl })}
          ${exportCell(cert.blockchainTx, "hash-cell")}
        </tr>`;
      })
      .join("");

    return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8" />
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>Certificates</x:Name>
          <x:WorksheetOptions>
            <x:FreezePanes/>
            <x:FrozenNoSplit/>
            <x:SplitHorizontal>6</x:SplitHorizontal>
            <x:TopRowBottomPane>6</x:TopRowBottomPane>
            <x:ActivePane>2</x:ActivePane>
          </x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    body {
      font-family: Calibri, Arial, sans-serif;
      color: #172033;
      background: #ffffff;
    }
    table {
      border-collapse: collapse;
      table-layout: fixed;
      width: 1900px;
    }
    .title {
      color: #0f766e;
      font-size: 24px;
      font-weight: 700;
      border: none;
      padding: 8px 0;
    }
    .meta {
      color: #536275;
      border: none;
      padding: 4px 0 12px;
    }
    .summary-label {
      background: #edfdf8;
      color: #0f766e;
      border: 1px solid #b7eee0;
      font-weight: 700;
      padding: 8px;
    }
    .summary-value {
      border: 1px solid #d7e4ea;
      font-weight: 700;
      padding: 8px;
      mso-number-format: "\\@";
    }
    th {
      background: #0f172a;
      color: #ffffff;
      border: 1px solid #334155;
      font-weight: 700;
      padding: 9px 8px;
      text-align: left;
      vertical-align: middle;
    }
    td {
      border: 1px solid #d7e4ea;
      padding: 8px;
      vertical-align: top;
      white-space: normal;
      mso-number-format: "\\@";
    }
    .number-cell {
      text-align: center;
      mso-number-format: "0";
    }
    .text-cell,
    .date-cell,
    .wide-cell,
    .hash-cell,
    .link-cell {
      mso-number-format: "\\@";
    }
    .wide-cell {
      width: 280px;
    }
    .hash-cell,
    .link-cell {
      width: 360px;
      word-break: break-all;
      color: #0f3b57;
    }
    .status-active {
      background: #dcfce7;
      color: #166534;
      font-weight: 700;
      mso-number-format: "\\@";
    }
    .status-revoked {
      background: #fee2e2;
      color: #991b1b;
      font-weight: 700;
      mso-number-format: "\\@";
    }
    a {
      color: #0369a1;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <table>
    <colgroup>
      <col style="width:60px" />
      <col style="width:120px" />
      <col style="width:190px" />
      <col style="width:240px" />
      <col style="width:320px" />
      <col style="width:130px" />
      <col style="width:150px" />
      <col style="width:130px" />
      <col style="width:150px" />
      <col style="width:160px" />
      <col style="width:360px" />
      <col style="width:360px" />
      <col style="width:420px" />
    </colgroup>
    <tr><td colspan="13" class="title">BlockCert Student Certificate Export</td></tr>
    <tr><td colspan="13" class="meta">Generated on ${escapeExcelHtml(generatedAt)}${filterSummary ? ` | ${escapeExcelHtml(filterSummary)}` : ""}</td></tr>
    <tr>
      <td class="summary-label">Total Records</td>
      <td class="summary-value">${rows.length}</td>
      <td class="summary-label">Active</td>
      <td class="summary-value">${activeCount}</td>
      <td class="summary-label">Revoked</td>
      <td class="summary-value">${revokedCount}</td>
      <td colspan="7" class="meta">Dates are exported as readable text to prevent Excel ##### display.</td>
    </tr>
    <tr><td colspan="13" class="meta"></td></tr>
    <tr>
      <th>No.</th>
      <th>Certificate ID</th>
      <th>Student Name</th>
      <th>Student Email</th>
      <th>Course Name</th>
      <th>Certificate Type</th>
      <th>Issue Date</th>
      <th>Record Status</th>
      <th>Blockchain Status</th>
      <th>Email Delivery</th>
      <th>Student Verify Link</th>
      <th>Certificate PDF Link</th>
      <th>Blockchain Transaction Hash</th>
    </tr>
    ${tableRows || `<tr><td colspan="13">No certificate records found.</td></tr>`}
  </table>
</body>
</html>`;
  };

  const csvCell = (value: unknown) => {
    const text = exportText(value, "");
    return `"${text.replace(/"/g, '""')}"`;
  };

  const buildCsvExport = (rows: Certificate[]) => {
    const headers = [
      "No.",
      "Certificate ID",
      "Student Name",
      "Student Email",
      "Course Name",
      "Certificate Type",
      "Issue Date",
      "Expiry Date",
      "Record Status",
      "Blockchain Status",
      "Email Delivery",
      "Student Verify Link",
      "Certificate PDF Link",
      "Blockchain Transaction Hash",
    ];

    const body = rows.map((cert, index) => {
      const verificationUrl = buildCertificateVerifyUrl(cert.certificateId);
      const pdfUrl = cert.ipfsPdfHash ? `${IPFS_GATEWAY}${cert.ipfsPdfHash}` : "";
      const recordStatus = cert.revoked
        ? "Revoked"
        : cert.expiryDate && new Date(cert.expiryDate).getTime() < Date.now()
          ? "Expired"
          : "Active";

      return [
        index + 1,
        cert.certificateId,
        cert.studentName,
        cert.studentEmail,
        cert.courseName,
        formatTemplateLabel(cert.template),
        formatExportDate(cert.issueDate),
        formatExportDate(cert.expiryDate),
        recordStatus,
        titleCaseStatus(cert.chainStatus || "confirmed"),
        emailStatusMeta(cert).label,
        verificationUrl,
        pdfUrl,
        cert.blockchainTx,
      ]
        .map(csvCell)
        .join(",");
    });

    return [headers.map(csvCell).join(","), ...body].join("\r\n");
  };

  const exportCertificates = async () => {
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "10000",
      });

      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);

      const res = await fetch(`${getApiBaseUrl()}/api/issue/all?${params.toString()}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Export data failed.");

      const payload = await res.json();
      const rows: Certificate[] = payload.certificates ?? [];

      if (exportFormat === "csv") {
        const csv = buildCsvExport(rows);
        const blob = new Blob([`\ufeff${csv}`], {
          type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `blockcert_certificates_readable_${format(
          new Date(),
          "yyyy-MM-dd"
        )}.csv`;
        link.click();
        URL.revokeObjectURL(url);

        toast({
          title: "Readable CSV exported",
          description: "Student data was exported in a clean CSV format.",
        });
        return;
      }

      const excelHtml = buildExcelExportHtml(rows);
      const blob = new Blob([`\ufeff${excelHtml}`], {
        type: "application/vnd.ms-excel;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `blockcert_certificates_readable_${format(
        new Date(),
        "yyyy-MM-dd"
      )}.xls`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Readable Excel exported",
        description: "Dates, IDs, statuses, and links are formatted for Excel.",
      });
    } catch (err: any) {
      toast({
        title: "Export failed",
        description: err?.message || "Could not export certificate list.",
        variant: "destructive",
      });
    }
  };

  const handleRevoke = async (cert: Certificate) => {
    if (cert.revoked) return;

    const confirmed = window.confirm(
      `Revoke certificate ${cert.certificateId}? The platform wallet will submit the blockchain revoke transaction.`
    );

    if (!confirmed) return;

    setRevokingId(cert.certificateId);
    try {
      const res = await fetch(
        `${getApiBaseUrl()}/api/issue/${cert.certificateId}/revoke`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({}),
        }
      );

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message || "Failed to save revoke status.");
      }

      toast({
        title: "Certificate revoked",
        description: `Certificate ${cert.certificateId} was revoked successfully.`,
      });

      await refreshDashboard();
    } catch (err: any) {
      toast({
        title: "Revoke failed",
        description: err?.message || "Could not revoke certificate.",
        variant: "destructive",
      });
    } finally {
      setRevokingId(null);
    }
  };

  const analyticsCards = [
    { label: "Total Certificates", value: stats.total, icon: FileCheck },
    { label: "Active", value: stats.active, icon: BadgeCheck },
    { label: "Expired", value: stats.expired, icon: CalendarDays },
    { label: "Revoked", value: stats.revoked, icon: Ban },
    { label: "This Month", value: stats.thisMonth, icon: CalendarDays },
  ];

  const monthLabel = (year: number, month: number) =>
    new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
      month: "short",
      year: "2-digit",
    });

  const simpleBars = (
    items: Array<{ label: string; count: number }>,
    emptyLabel: string
  ) => {
    const max = Math.max(...items.map((item) => item.count), 1);
    if (!items.length) {
      return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
    }

    return (
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-muted-foreground">{item.label}</span>
              <span className="font-semibold text-foreground">{item.count}</span>
            </div>
            <div className="h-2 rounded-full bg-background">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-primary to-accent"
                style={{ width: `${Math.max((item.count / max) * 100, 6)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

  const statusBadgeClass = (tone: "green" | "yellow" | "red" | "blue") => {
    const map = {
      green: "border-secondary/45 bg-secondary/10 text-secondary",
      yellow: "border-accent/40 bg-accent/10 text-accent",
      red: "border-destructive/40 bg-destructive/10 text-destructive",
      blue: "border-primary/40 bg-primary/10 text-primary",
    };
    return `rounded-md border px-2 py-1 text-xs font-medium ${map[tone]}`;
  };

  const chainTone = (status?: string): "green" | "yellow" | "red" | "blue" =>
    status === "failed" ? "red" : status === "pending" ? "yellow" : "green";

  const deliveryCardClass = (tone: "green" | "yellow" | "red" | "blue" | "muted") => {
    const map = {
      green: "border-secondary/45 bg-secondary/10 text-secondary",
      yellow: "border-accent/40 bg-accent/10 text-accent",
      red: "border-destructive/40 bg-destructive/10 text-destructive",
      blue: "border-primary/40 bg-primary/10 text-primary",
      muted: "border-border bg-background/55 text-muted-foreground",
    };

    return `min-w-[170px] rounded-md border px-3 py-2 text-xs ${map[tone]}`;
  };

  const emailStatusMeta = (cert: Certificate) => {
    const status = (cert.emailStatus || "not_started").toLowerCase();

    if (status === "sent") {
      return {
        label: "Email Sent",
        detail: "Delivered to student",
        tone: "green" as const,
        icon: BadgeCheck,
      };
    }

    if (status === "queued") {
      return {
        label: "Email Queued",
        detail: "Sending shortly",
        tone: "blue" as const,
        icon: Mail,
      };
    }

    if (status === "waiting_chain") {
      return {
        label: "Waiting Chain",
        detail: "Sends after confirmation",
        tone: "yellow" as const,
        icon: Loader2,
        spin: true,
      };
    }

    if (status === "failed") {
      return {
        label: "Email Failed",
        detail: "Check SMTP or resend",
        tone: "red" as const,
        icon: Ban,
      };
    }

    if (status === "skipped") {
      return {
        label: "Email Skipped",
        detail: "Email service not ready",
        tone: "yellow" as const,
        icon: Mail,
      };
    }

    return {
      label: "Not Sent Yet",
      detail:
        cert.chainStatus === "confirmed"
          ? "Use Resend to send"
          : "Waiting for issue flow",
      tone: "muted" as const,
      icon: Mail,
    };
  };

  const renderDeliveryStatus = (cert: Certificate) => {
    const meta = emailStatusMeta(cert);
    const Icon = meta.icon;
    const latestEmail = cert.emailHistory?.[cert.emailHistory.length - 1];

    return (
      <div className="space-y-2">
        <div className={deliveryCardClass(meta.tone)}>
          <div className="flex items-center gap-2 font-semibold">
            <Icon className={`h-4 w-4 ${meta.spin ? "animate-spin" : ""}`} />
            {meta.label}
          </div>
          <p className="mt-1 leading-snug opacity-85">{meta.detail}</p>
        </div>
        {cert.emailSentAt && (
          <p className="text-xs text-muted-foreground">
            Sent {new Date(cert.emailSentAt).toLocaleString()}
          </p>
        )}
        {cert.emailError && (
          <p className="max-w-[220px] truncate text-xs text-destructive">
            {cert.emailError}
          </p>
        )}
        {latestEmail && (
          <p className="max-w-[220px] truncate text-xs text-muted-foreground">
            Last: {latestEmail.action} / {latestEmail.status}
          </p>
        )}
      </div>
    );
  };

  const renderDateField = (
    picker: "from" | "to" | "edit" | "editExpiry",
    value: string,
    onChange: (value: string) => void,
    fallback = "dd-mm-yyyy",
    disabledDate?: (date: Date) => boolean,
    triggerDisabled = false
  ) => (
    <Popover
      open={datePickerOpen === picker}
      onOpenChange={(open) => setDatePickerOpen(open ? picker : null)}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={triggerDisabled}
          className={`w-full justify-start bg-card/80 text-left font-normal ${
            value ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <CalendarDays className="h-4 w-4 text-primary" />
          {formatDateButtonLabel(value, fallback)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parseDateValue(value)}
          disabled={disabledDate}
          onSelect={(date) => {
            onChange(date ? toDateValue(date) : "");
            setDatePickerOpen(null);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <header className="border-b border-border/70 bg-card/90 shadow-sm backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="brand-gradient flex h-11 w-11 items-center justify-center rounded-md text-white">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  {isSuperAdminView ? "Certificate Oversight" : "Admin Dashboard"}
                </h1>
                {adminUser ? (
                  <div className="space-y-0.5 text-sm text-muted-foreground">
                    <p>
                      {adminUser.name} ({adminUser.email})
                    </p>
                    {!isSuperAdminView && adminUser.plan && (
                      <p className="text-xs capitalize">
                        {adminUser.plan.name || "trial"} plan -{" "}
                        {adminUser.plan.remaining ?? 0} of{" "}
                        {adminUser.plan.certificateLimit ?? 5} certificates remaining
                      </p>
                    )}
                    {adminUser.planUpgradeRequest?.status === "pending" && (
                      <p className="text-xs font-semibold text-primary">
                        Upgrade requested:{" "}
                        {adminUser.planUpgradeRequest.requestedPlan?.name || "plan"}
                      </p>
                    )}
                    {isSuperAdminView ? (
                      <p className="text-xs font-semibold text-primary">
                        Viewing certificates across all admins
                      </p>
                    ) : (
                      <p
                        className={`text-xs font-semibold ${
                          institutionStatusClass(
                            adminUser.institutionVerification?.status || "unverified"
                          )
                        }`}
                      >
                        {institutionStatusLabels[
                          adminUser.institutionVerification?.status || "unverified"
                        ] || "Institution not submitted"}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading admin...</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-card/80"
                onClick={exportCertificates}
              >
                <Download className="h-4 w-4" />
                Export {exportFormat === "csv" ? "CSV" : "Excel"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-card/80"
                onClick={refreshDashboard}
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 sm:px-6">
        <div className="space-y-6">
          <div className={`grid gap-4 ${isSuperAdminView ? "" : "lg:grid-cols-[1.35fr_0.65fr]"}`}>
            {!isSuperAdminView && (
              <Button
                onClick={() => navigate("/issue")}
                className="group h-auto min-h-28 justify-start overflow-hidden rounded-lg bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--blockchain-secondary)))] p-0 text-left shadow-[var(--glow-primary)] hover:brightness-105"
              >
                <span className="flex min-h-28 w-full items-stretch">
                  <span className="flex w-20 shrink-0 items-center justify-center bg-white/15 ring-1 ring-inset ring-white/20 sm:w-24">
                    <Plus className="h-8 w-8" />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-4 px-5 py-4">
                    <span className="whitespace-normal text-xl font-bold leading-tight sm:text-2xl">
                      Issue New Certificate
                    </span>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/16">
                      <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </span>
                </span>
              </Button>
            )}
            <Button
              onClick={() => navigate("/verify")}
              variant="outline"
              className="group h-auto min-h-28 justify-center rounded-lg border-secondary/45 bg-secondary/10 px-5 py-4 text-center shadow-none hover:border-secondary hover:bg-secondary/15 hover:text-secondary"
            >
              <span className="flex flex-col items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-secondary/45 bg-background/55 text-secondary transition-transform group-hover:scale-105">
                  <FileSearch className="h-6 w-6" />
                </span>
                <span className="whitespace-normal text-base font-semibold leading-tight text-foreground transition-colors group-hover:text-secondary sm:text-lg">
                  Verify Certificate
                </span>
              </span>
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {analyticsCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.label} className="surface-card">
                  <CardContent className="flex items-center justify-between p-5">
                    <div>
                      <p className="text-sm text-muted-foreground">{card.label}</p>
                      <p className="mt-1 text-3xl font-bold text-foreground">
                        {isStatsLoading ? "-" : card.value}
                      </p>
                    </div>
                    <div className="brand-gradient flex h-11 w-11 items-center justify-center rounded-md text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-secondary" />
                  Most Issued Course
                </CardTitle>
                <CardDescription>
                  {stats.mostIssuedCourseCount
                    ? `${stats.mostIssuedCourseCount} certificate(s)`
                    : "No course data yet"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-foreground">
                  {stats.mostIssuedCourse}
                </p>
              </CardContent>
            </Card>

            <Card className="surface-card">
              <CardHeader>
                <CardTitle>Last Issued</CardTitle>
                <CardDescription>Latest certificate record</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.lastIssuedCertificate ? (
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold text-foreground">
                      {stats.lastIssuedCertificate.studentName}
                    </p>
                    <p className="text-muted-foreground">
                      {stats.lastIssuedCertificate.courseName} - ID{" "}
                      {stats.lastIssuedCertificate.certificateId}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No certificate issued yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="text-lg">Monthly Issued</CardTitle>
                <CardDescription>Certificates issued by month</CardDescription>
              </CardHeader>
              <CardContent>
                {simpleBars(
                  (stats.monthlyIssued || []).map((item) => ({
                    label: monthLabel(item.year, item.month),
                    count: item.count,
                  })),
                  "No monthly data yet."
                )}
              </CardContent>
            </Card>

            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="text-lg">Course Wise</CardTitle>
                <CardDescription>Most active courses</CardDescription>
              </CardHeader>
              <CardContent>
                {simpleBars(
                  (stats.courseBreakdown || []).map((item) => ({
                    label: item.courseName,
                    count: item.count,
                  })),
                  "No course data yet."
                )}
              </CardContent>
            </Card>

            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="text-lg">Email Delivery</CardTitle>
                <CardDescription>Status of certificate emails</CardDescription>
              </CardHeader>
              <CardContent>
                {simpleBars(
                  (stats.emailStats || []).map((item) => ({
                    label: item.status.replace(/_/g, " "),
                    count: item.count,
                  })),
                  "No email data yet."
                )}
              </CardContent>
            </Card>

            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="text-lg">Revoked Trend</CardTitle>
                <CardDescription>Revocations by month</CardDescription>
              </CardHeader>
              <CardContent>
                {simpleBars(
                  (stats.revokedTrend || []).map((item) => ({
                    label: monthLabel(item.year, item.month),
                    count: item.count,
                  })),
                  "No revoked certificates yet."
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="surface-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-card-foreground">
                <Search className="h-5 w-5 text-primary" />
                Search & Filter Certificates
              </CardTitle>
              <CardDescription>
                Search by certificate ID, student name, or course. Filter by status and issue date.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_auto_auto]">
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applyFilters();
                  }}
                  placeholder="Search certificates..."
                  className="bg-background/70"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="revoked">Revoked</SelectItem>
                  </SelectContent>
                </Select>
                {renderDateField("from", fromDate, setFromDate, "Starting Date")}
                {renderDateField("to", toDate, setToDate, "End Date")}
                <Button onClick={applyFilters}>Apply</Button>
                <Button variant="outline" className="bg-card/80" onClick={clearFilters}>
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="surface-card">
            <CardHeader>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-card-foreground">
                    <FileCheck className="h-5 w-5 text-accent" />
                    Certificates
                  </CardTitle>
                  <CardDescription>
                    {totalResults} live certificate record(s)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : loadError ? (
                <div className="py-12 text-center">
                  <FileCheck className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-lg font-medium text-foreground">Live data unavailable</p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    {loadError}
                  </p>
                  <Button
                    onClick={() => fetchCertificates({ pageToLoad: page })}
                    className="mt-4"
                    variant="outline"
                  >
                    Retry
                  </Button>
                </div>
              ) : certificates.length === 0 ? (
                <div className="py-12 text-center">
                  <FileCheck className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-lg text-muted-foreground">No certificates found</p>
                  <Button onClick={() => navigate("/issue")} className="mt-4" variant="outline">
                    Issue Your First Certificate
                  </Button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border border-border bg-card/70">
                    <Table
                      className={
                        compactDashboardList
                          ? "[&_td]:p-2 [&_th]:h-10 [&_th]:px-2"
                          : ""
                      }
                    >
                      <TableHeader className="bg-muted/70">
                        <TableRow>
                          <TableHead>Certificate ID</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Course</TableHead>
                          <TableHead>Issue Date</TableHead>
                          <TableHead>Record Status</TableHead>
                          <TableHead>Delivery</TableHead>
                          <TableHead>Issued By</TableHead>
                          <TableHead className="min-w-[220px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {certificates.map((cert) => (
                          <TableRow
                            key={cert.certificateId}
                            className={compactDashboardList ? "text-xs" : ""}
                          >
                            <TableCell className="font-mono text-sm">
                              {cert.certificateId}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p>{cert.studentName}</p>
                                {cert.studentEmail && (
                                  <p className="text-xs text-muted-foreground">
                                    {cert.studentEmail}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p>{cert.courseName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatTemplateLabel(cert.template)}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p>{new Date(cert.issueDate).toLocaleDateString()}</p>
                                <p className="text-xs text-muted-foreground">
                                  Expiry:{" "}
                                  {cert.expiryDate
                                    ? new Date(cert.expiryDate).toLocaleDateString()
                                    : "No expiry"}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <span
                                  className={
                                    cert.revoked
                                      ? statusBadgeClass("red")
                                      : cert.expiryDate &&
                                          new Date(cert.expiryDate).getTime() < Date.now()
                                        ? statusBadgeClass("yellow")
                                      : statusBadgeClass("green")
                                  }
                                >
                                  {cert.revoked
                                    ? "Revoked"
                                    : cert.expiryDate &&
                                        new Date(cert.expiryDate).getTime() < Date.now()
                                      ? "Expired"
                                      : "Active"}
                                </span>
                                <span className={statusBadgeClass(chainTone(cert.chainStatus))}>
                                  Chain: {cert.chainStatus || "confirmed"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {renderDeliveryStatus(cert)}
                            </TableCell>
                            <TableCell>{cert.issuedBy}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewPDF(cert.ipfsPdfHash)}
                                  className="bg-card/80"
                                >
                                  <Eye className="h-4 w-4" /> PDF
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(buildCertificateVerifyPath(cert.certificateId))}
                                  className="bg-card/80"
                                >
                                  <FileSearch className="h-4 w-4" /> Verify
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyPublicLink(cert.certificateId)}
                                  className="bg-card/80"
                                >
                                  <Copy className="h-4 w-4" /> Link
                                </Button>
                                {!isSuperAdminView && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => startEdit(cert)}
                                      className="bg-card/80"
                                    >
                                      <Pencil className="h-4 w-4" /> Edit
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={
                                        resendingId === cert.certificateId ||
                                        cert.revoked ||
                                        cert.chainStatus === "pending" ||
                                        cert.chainStatus === "failed"
                                      }
                                      onClick={() => handleResendEmail(cert)}
                                      className="bg-card/80"
                                    >
                                      {resendingId === cert.certificateId ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Mail className="h-4 w-4" />
                                      )}
                                      Resend
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      disabled={Boolean(cert.revoked) || revokingId === cert.certificateId}
                                      onClick={() => handleRevoke(cert)}
                                    >
                                      {revokingId === cert.certificateId ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Ban className="h-4 w-4" />
                                      )}
                                      Revoke
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <Button
                      variant="outline"
                      className="bg-card/80"
                      disabled={page <= 1}
                      onClick={() => fetchCertificates({ pageToLoad: page - 1 })}
                    >
                      Previous
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </p>
                    <Button
                      variant="outline"
                      className="bg-card/80"
                      disabled={page >= totalPages}
                      onClick={() => fetchCertificates({ pageToLoad: page + 1 })}
                    >
                      Next
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog
        open={Boolean(editingCert)}
        onOpenChange={(open) => {
          if (!open) cancelEdit();
        }}
      >
        <DialogContent className="surface-card max-h-[92vh] max-w-2xl overflow-y-auto border-border p-0">
          <DialogHeader className="border-b border-border px-6 py-5 pr-12">
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Pencil className="h-5 w-5 text-primary" />
              Edit Certificate Record
            </DialogTitle>
            <DialogDescription>
              Saves corrections by revoking the old on-chain proof and issuing a new certificate with the same ID.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4 px-6 py-5"
            onSubmit={(event) => {
              event.preventDefault();
              saveEdit();
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Student Name</label>
                <Input
                  value={editForm.studentName}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, studentName: event.target.value }))
                  }
                  placeholder="Student name"
                  className="bg-background/70"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Student Email</label>
                <Input
                  type="email"
                  value={editForm.studentEmail}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, studentEmail: event.target.value }))
                  }
                  placeholder="Student email"
                  className="bg-background/70"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Course Name</label>
                <Input
                  value={editForm.courseName}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, courseName: event.target.value }))
                  }
                  placeholder="Course name"
                  className="bg-background/70"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Issue Date</label>
                {renderDateField("edit", editForm.issueDate, (value) =>
                  setEditForm((prev) => ({
                    ...prev,
                    issueDate: value,
                    expiryDate:
                      prev.expiryDate && value && !isDateAfter(prev.expiryDate, value)
                        ? ""
                        : prev.expiryDate,
                  }))
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Expiry Date</label>
                {renderDateField(
                  "editExpiry",
                  editForm.expiryDate,
                  (value) => setEditForm((prev) => ({ ...prev, expiryDate: value })),
                  editForm.issueDate ? "No expiry" : "Pick issue date first",
                  editForm.issueDate
                    ? (date) => isDateOnOrBefore(date, editForm.issueDate)
                    : () => true,
                  !editForm.issueDate
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Template</label>
                <Select
                  value={editForm.template}
                  onValueChange={(value) =>
                    setEditForm((prev) => ({ ...prev, template: value }))
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
                <label className="text-sm font-medium text-foreground">Edit Note</label>
                <Input
                  value={editForm.editNote}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, editNote: event.target.value }))
                  }
                  placeholder="Why are you editing this record?"
                  className="bg-background/70"
                />
              </div>
            </div>

            <div className="rounded-md border border-secondary/30 bg-secondary/10 p-3 text-sm text-muted-foreground">
              The platform wallet revokes the old proof and issues the corrected certificate. No MetaMask approval is needed from the admin.
            </div>
            {savingEditStep && (
              <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm font-medium text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                {savingEditStep}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="destructive"
                disabled={Boolean(savingEditId)}
                onClick={cancelEdit}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={Boolean(editingCert && savingEditId === editingCert.certificateId)}
              >
                {editingCert && savingEditId === editingCert.certificateId && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Reissue Certificate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;

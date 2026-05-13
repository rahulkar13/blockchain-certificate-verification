

import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import CertificateForm from "@/components/CertificateForm";
import LoaderOverlay from "@/components/LoaderOverlay";
import {
  Blocks,
  FileCheck2,
  ListChecks,
  Upload,
} from "lucide-react";

import { getNextCertificateId } from "@/utils/idGenerator";
import { generateFileHash } from "@/utils/hash";
import { uploadFileToPinata, uploadMetadataToPinata } from "@/utils/pinata";
import { generateCertificatePDF } from "@/utils/pdfGenerator";
import { loadAdminPreferences, normalizeCertificateTemplate } from "@/utils/adminSettings";
import { saveBatchToBackend, saveToBackend } from "@/utils/saveToBackend";
import { getApiBaseUrl } from "@/utils/api";

export default function IssueCertificate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [bulkRows, setBulkRows] = useState<any[]>([]);
  const [draftData, setDraftData] = useState<any | null>(null);
  const [issueSettings] = useState(loadAdminPreferences);
  const [loadingTitle, setLoadingTitle] = useState("Issuing Certificate");
  const [loadingDescription, setLoadingDescription] = useState(
    "Creating the PDF, uploading proof, and submitting the platform transaction."
  );
  const defaultTemplate = normalizeCertificateTemplate(issueSettings.defaultTemplate);
  const showChainProgress = issueSettings.showChainProgress !== false;

  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    if (!token) {
      navigate("/admin/login");
      return;
    }

    try {
      const adminUser = JSON.parse(localStorage.getItem("adminUser") || "{}");
      if (adminUser.role === "super_admin") {
        navigate("/super-admin/dashboard");
      }
    } catch {
      localStorage.removeItem("adminUser");
    }

    fetch(`${getApiBaseUrl()}/api/admin/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (data.role === "super_admin") {
          navigate("/super-admin/dashboard");
          return;
        }

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
      })
      .catch(() => undefined);
  }, [navigate]);

  const getAdminBranding = () => {
    try {
      const adminUser = JSON.parse(localStorage.getItem("adminUser") || "{}");
      return {
        branding: adminUser.branding || {},
        adminId: adminUser._id || "",
        plan: adminUser.plan || {},
        institutionStatus: adminUser.institutionVerification?.status || "unverified",
      };
    } catch {
      return { branding: {}, adminId: "", plan: {}, institutionStatus: "unverified" };
    }
  };

  const ensureInstitutionCanIssue = (requestedCount = 1) => {
    const { institutionStatus, plan } = getAdminBranding();
    if (institutionStatus === "verified") return true;

    const remaining = Number(plan?.remaining ?? 0);
    const isTrial = plan?.name === "trial" && plan?.status === "trial";
    if (isTrial && remaining >= requestedCount) {
      return true;
    }

    toast({
      title: isTrial ? "Trial limit reached" : "Institution not verified",
      description:
        institutionStatus === "suspended"
          ? "Your institution access is suspended. Contact the super admin."
          : isTrial
            ? "Trial accounts can issue 5 certificates without verification. Request a plan upgrade and complete institution verification to issue more."
            : "Save your institute profile and wait for super admin verification before issuing certificates.",
      variant: "destructive",
    });
    return false;
  };

  const applyBranding = (data: any) => {
    const { branding, adminId } = getAdminBranding();
    return {
      ...data,
      adminId,
      branding,
      certificateText: data.certificateText || branding.certificateBody || "",
    };
  };

  const confirmDuplicateCertificate = async (data: any) => {
    const token = localStorage.getItem("adminToken");
    const response = await fetch(`${getApiBaseUrl()}/api/issue/duplicates/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || ""}`,
      },
      body: JSON.stringify(data),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || "Could not check duplicate certificates.");
    }

    if (!payload.hasDuplicates) {
      return { confirmed: true, allowDuplicate: false };
    }

    const duplicateSummary = (payload.duplicates || [])
      .slice(0, 3)
      .map(
        (duplicate: any) =>
          `${duplicate.certificateId} - ${duplicate.studentName} / ${duplicate.courseName}`
      )
      .join("\n");

    const confirmed = window.confirm(
      `Possible duplicate certificate found:\n\n${duplicateSummary}\n\nIssue another certificate anyway?`
    );
    return { confirmed, allowDuplicate: confirmed };
  };

  const confirmDuplicateBatch = async (rows: any[]) => {
    const duplicateRows: string[] = [];

    for (const row of rows) {
      const data = applyBranding({
        ...row,
        issueDate: row.issueDate ? new Date(row.issueDate) : new Date(),
        expiryDate: row.expiryDate ? new Date(row.expiryDate) : null,
        template: normalizeCertificateTemplate(row.template || defaultTemplate),
      });
      const token = localStorage.getItem("adminToken");
      const response = await fetch(`${getApiBaseUrl()}/api/issue/duplicates/check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify(data),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || "Could not check duplicate certificates.");
      }
      if (payload.hasDuplicates) {
        duplicateRows.push(`${row.studentName} - ${row.courseName}`);
      }
    }

    if (duplicateRows.length === 0) {
      return { confirmed: true, allowDuplicate: false };
    }

    const confirmed = window.confirm(
      `Possible duplicates found for ${duplicateRows.length} row(s):\n\n${duplicateRows
        .slice(0, 5)
        .join("\n")}\n\nIssue them anyway?`
    );
    return { confirmed, allowDuplicate: confirmed };
  };

  const parseCsvLine = (line: string) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];

      if (char === '"' && next === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    cells.push(current.trim());
    return cells;
  };

  const normalizeBulkRow = (row: Record<string, string>) => {
    const get = (...keys: string[]) => {
      const match = keys.find((key) => row[key.toLowerCase()]);
      return match ? row[match.toLowerCase()] : "";
    };

    return {
      studentName: get("studentName", "student name", "name"),
      studentEmail: get("studentEmail", "student email", "email"),
      courseName: get("courseName", "course name", "course"),
      issueDate: get("issueDate", "issue date", "date") || new Date().toISOString(),
      additionalInfo: get("additionalInfo", "additional info", "info"),
      expiryDate: get("expiryDate", "expiry date", "valid until", "validTill"),
      template: normalizeCertificateTemplate(get("template") || defaultTemplate),
    };
  };

  const handleBulkImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        throw new Error("CSV must include a header row and at least one student.");
      }

      const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
      const rows = lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        const row = headers.reduce<Record<string, string>>((acc, header, index) => {
          acc[header] = values[index] || "";
          return acc;
        }, {});
        return normalizeBulkRow(row);
      });

      setBulkRows(rows);
      setDraftData(rows[0]);
      toast({
        title: "Bulk list imported",
        description: `${rows.length} student row(s) loaded. Select a row to issue.`,
      });
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  };

  const handlePreview = async (data: any) => {
    setPreviewLoading(true);
    try {
      const pdf = await generateCertificatePDF(applyBranding(data), "PREVIEW");
      const url = URL.createObjectURL(pdf);
      window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error: any) {
      toast({
        title: "Preview failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async (data: any) => {
  try {
    if (!ensureInstitutionCanIssue(1)) return;

    const brandedData = applyBranding(data);
    setLoading(true);
    setLoadingTitle("Issuing Certificate");
    setLoadingDescription("Checking for duplicate certificate records.");

    const duplicateDecision = await confirmDuplicateCertificate(brandedData);
    if (!duplicateDecision.confirmed) {
      setLoading(false);
      return;
    }

    setLoadingDescription("Creating the PDF, uploading proof, and submitting the platform transaction.");

    console.time("TOTAL TIME");

    console.time("STEP 1 - Get Next Cert ID");
    const certId = await getNextCertificateId();
    console.timeEnd("STEP 1 - Get Next Cert ID");

    console.time("STEP 2 - Generate PDF");
    const pdf = await generateCertificatePDF(brandedData, certId);
    console.timeEnd("STEP 2 - Generate PDF");

    const fileName = `${data.studentName.replace(/\s+/g, "_")}_Certificate.pdf`;

    console.time("STEP 3 - Hash PDF and Upload PDF to PINATA");
    const [hash, pdfCid] = await Promise.all([
      generateFileHash(pdf),
      uploadFileToPinata(pdf),
    ]);
    console.timeEnd("STEP 3 - Hash PDF and Upload PDF to PINATA");

    console.time("STEP 4 - Upload Metadata to PINATA");
    const metadataCid = await uploadMetadataToPinata({
      ...brandedData,
      fileName,
      fileHash: hash,
      ipfsPdfHash: pdfCid,
    });
    console.timeEnd("STEP 4 - Upload Metadata to PINATA");

    console.time("STEP 5 - Save and Issue from Backend");
    setLoadingDescription("Submitting certificate to the platform wallet...");
    const saveResult = await saveToBackend(
      brandedData,
      certId,
      pdfCid,
      fileName,
      pdf,
      hash,
      metadataCid,
      { allowDuplicate: duplicateDecision.allowDuplicate }
    );
    console.timeEnd("STEP 5 - Save and Issue from Backend");

    console.timeEnd("TOTAL TIME");

    // Download final PDF
    const url = URL.createObjectURL(pdf);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Certificate Issued",
      description: saveResult?.email?.queued
        ? `Certificate ${certId} saved. Email will send after blockchain confirmation.`
        : saveResult?.email?.sent
        ? `Certificate ${certId} issued and emailed to ${data.studentEmail}.`
        : `Certificate ${certId} issued. Email was not sent because the email service is not ready.`,
    });

    if (bulkRows.length > 0) {
      const currentIndex = bulkRows.findIndex((row) => row === draftData);
      const nextRow = bulkRows[currentIndex + 1];
      if (nextRow) {
        setDraftData(nextRow);
        toast({
          title: "Next bulk row loaded",
          description: `${nextRow.studentName || "Next student"} is ready.`,
        });
      }
    }

  } catch (err: any) {
    toast({
      title: "Error",
      description: err.message,
      variant: "destructive",
    });
  } finally {
    setLoading(false);
  }
};

  const buildSequentialCertificateIds = (startId: string, count: number) => {
    const width = Math.max(startId.length, 4);
    const startNumber = Number.parseInt(startId, 10);

    if (!Number.isFinite(startNumber)) {
      throw new Error("Could not generate certificate IDs for batch issue.");
    }

    return Array.from({ length: count }, (_, index) =>
      String(startNumber + index).padStart(width, "0")
    );
  };

  const validateBulkRows = () => {
    if (bulkRows.length === 0) {
      throw new Error("Import a CSV file before batch issue.");
    }

    if (bulkRows.length > 50) {
      throw new Error("Batch issue supports up to 50 certificates at a time.");
    }

    const missingRow = bulkRows.find(
      (row) => !row.studentName || !row.studentEmail || !row.courseName || !row.issueDate
    );

    if (missingRow) {
      throw new Error("Every CSV row needs studentName, studentEmail, courseName, and issueDate.");
    }
  };

  const handleBatchIssue = async () => {
    try {
      validateBulkRows();
      if (!ensureInstitutionCanIssue(bulkRows.length)) return;

      const duplicateDecision = await confirmDuplicateBatch(bulkRows);
      if (!duplicateDecision.confirmed) return;

      const confirmed = window.confirm(
        `Issue ${bulkRows.length} certificates using the platform wallet?`
      );

      if (!confirmed) return;

      setLoading(true);
      setLoadingTitle("Batch Issuing Certificates");

      setLoadingDescription("Generating certificate IDs...");
      const firstCertId = await getNextCertificateId();
      const certIds = buildSequentialCertificateIds(firstCertId, bulkRows.length);
      const preparedRecords = [];

      for (let index = 0; index < bulkRows.length; index += 1) {
        const row = bulkRows[index];
        const certId = certIds[index];
        const data = applyBranding({
          ...row,
          issueDate: row.issueDate ? new Date(row.issueDate) : new Date(),
          expiryDate: row.expiryDate ? new Date(row.expiryDate) : null,
          template: normalizeCertificateTemplate(row.template || defaultTemplate),
        });

        setLoadingDescription(
          `Preparing ${index + 1} of ${bulkRows.length}: ${data.studentName}`
        );

        const pdf = await generateCertificatePDF(data, certId);
        const fileName = `${data.studentName.replace(/\s+/g, "_")}_Certificate.pdf`;
        const [hash, pdfCid] = await Promise.all([
          generateFileHash(pdf),
          uploadFileToPinata(pdf),
        ]);
        const metadataCid = await uploadMetadataToPinata({
          ...data,
          certificateId: certId,
          fileName,
          fileHash: hash,
          ipfsPdfHash: pdfCid,
        });

        preparedRecords.push({
          data,
          certId,
          pdf,
          fileName,
          hash,
          pdfCid,
          metadataCid,
        });
      }

      setLoadingDescription("Submitting batch to the platform wallet...");
      await saveBatchToBackend(
        preparedRecords.map((record) => ({
          data: record.data,
          certId: record.certId,
          pdfCid: record.pdfCid,
          fileName: record.fileName,
          pdfFile: record.pdf,
          fileHash: record.hash,
          metadataCid: record.metadataCid,
        })),
        { allowDuplicate: duplicateDecision.allowDuplicate }
      );

      toast({
        title: "Batch certificates issued",
        description: `${preparedRecords.length} certificates were submitted through the platform wallet.`,
      });
      setBulkRows([]);
      setDraftData(null);
    } catch (error: any) {
      toast({
        title: "Batch issue failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="container mx-auto px-4 py-10 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
        <section className="space-y-5">
          <div className="surface-card rounded-lg p-6">
            <p className="section-kicker mb-3">Admin Issuance</p>
            <h1 className="text-4xl font-bold leading-tight text-foreground">
              Issue a secured certificate
            </h1>
            <p className="mt-4 text-muted-foreground">
              Create the PDF, publish certificate metadata, and confirm the
              blockchain record through the platform wallet.
            </p>
          </div>

          <div className="surface-card rounded-lg p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-md text-white">
                <ListChecks className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Bulk issue queue</p>
                <p className="text-sm text-muted-foreground">Import CSV and issue row by row</p>
              </div>
            </div>
            <div className="mb-4 rounded-md border border-primary/25 bg-primary/10 p-4 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">CSV data format</p>
              <p className="mt-2">
                Required columns:{" "}
                <span className="font-mono text-primary">
                  studentName, studentEmail, courseName, issueDate
                </span>
              </p>
              <p className="mt-1">
                Optional columns:{" "}
                <span className="font-mono text-primary">additionalInfo, template</span>
              </p>
              <p className="mt-1">
                Date format: <span className="font-mono text-primary">YYYY-MM-DD</span>
              </p>
              <p className="mt-1">
                Template values:{" "}
                <span className="font-mono text-primary">
                  completion, internship, participation
                </span>
              </p>
            </div>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background/55 p-3 text-sm font-medium text-foreground transition-colors hover:border-primary/50">
              <Upload className="h-4 w-4 text-primary" />
              Import CSV / Excel CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleBulkImport}
              />
            </label>
            {bulkRows.length > 0 && (
              <div className="mt-4 space-y-3">
                <Button
                  type="button"
                  className="w-full"
                  disabled={loading || previewLoading}
                  onClick={handleBatchIssue}
                >
                  <Blocks className="h-4 w-4" />
                  Issue {bulkRows.length} Certificates in 1 Transaction
                </Button>
                <p className="text-xs text-muted-foreground">
                  The platform wallet submits the whole imported CSV batch together.
                </p>
                <div className="max-h-56 space-y-2 overflow-auto pr-1">
                  {bulkRows.map((row, index) => (
                    <button
                      key={`${row.studentEmail}-${index}`}
                      type="button"
                      onClick={() => setDraftData(row)}
                      className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${
                        draftData === row
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background/45 text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      <span className="block font-medium text-foreground">
                        {index + 1}. {row.studentName || "Unnamed student"}
                      </span>
                      <span className="block text-xs">{row.studentEmail || "No email"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center gap-3">
            <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-md text-white">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Certificate form</p>
              <h2 className="text-xl font-semibold text-foreground">Student details</h2>
            </div>
          </div>
          <CertificateForm
            onSubmit={handleSubmit}
            onPreview={handlePreview}
            isLoading={loading || previewLoading}
            draftData={draftData}
            defaultTemplate={defaultTemplate}
          />
        </section>
      </div>
      {loading && showChainProgress && (
        <LoaderOverlay
          title={loadingTitle}
          description={loadingDescription}
        />
      )}
    </div>
  );
}

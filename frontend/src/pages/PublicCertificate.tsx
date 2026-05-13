import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BadgeCheck,
  Calendar,
  ExternalLink,
  FileText,
  GraduationCap,
  Hash,
  Loader2,
  ShieldCheck,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiBaseUrl } from "@/utils/api";
import { getReadOnlyContract } from "@/utils/contract";

interface PublicCertificateRecord {
  certificateId: string;
  chainCertificateId?: string;
  studentName: string;
  courseName: string;
  issueDate: string;
  expiryDate?: string;
  ipfsPdfHash: string;
  blockchainTx: string;
  chainStatus?: string;
  template?: string;
  issuedBy?: string;
  revoked?: boolean;
  verificationStatus?: "valid" | "expired" | "revoked";
  brandingSnapshot?: Record<string, string>;
  institutionVerificationSnapshot?: {
    status?: string;
    instituteName?: string;
    reviewedAt?: string;
    locked?: boolean;
  };
}

interface CertificateMetadata {
  studentName?: string;
  courseName?: string;
  issueDate?: string;
  expiryDate?: string;
  fileHash?: string;
  ipfsPdfHash?: string;
}

const emptyHash = `0x${"0".repeat(64)}`;

const formatDate = (value?: string) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const shortHash = (value?: string) => {
  if (!value) return "Not available";
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
};

const PublicCertificate = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const adminId = searchParams.get("admin") || "";
  const [record, setRecord] = useState<PublicCertificateRecord | null>(null);
  const [metadata, setMetadata] = useState<CertificateMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [chainRevoked, setChainRevoked] = useState(false);
  const [chainChecked, setChainChecked] = useState(false);

  const pdfHash = metadata?.ipfsPdfHash || record?.ipfsPdfHash || "";
  const pdfUrl = pdfHash ? `https://gateway.pinata.cloud/ipfs/${pdfHash}` : "";
  const isRevoked = Boolean(record?.revoked || chainRevoked);
  const isExpired = Boolean(
    record?.expiryDate && new Date(record.expiryDate).getTime() < Date.now()
  );
  const verificationStatus = isRevoked ? "revoked" : isExpired ? "expired" : "valid";
  const isVerified = Boolean(record && chainChecked && verificationStatus === "valid");
  const branding = record?.brandingSnapshot || {};

  const detailRows = useMemo(
    () => [
      {
        label: "Student",
        value: metadata?.studentName || record?.studentName || "Not available",
        icon: User,
      },
      {
        label: "Course",
        value: metadata?.courseName || record?.courseName || "Not available",
        icon: GraduationCap,
      },
      {
        label: "Issued On",
        value: formatDate(metadata?.issueDate || record?.issueDate),
        icon: Calendar,
      },
      {
        label: "Expires On",
        value: record?.expiryDate || metadata?.expiryDate
          ? formatDate(record?.expiryDate || metadata?.expiryDate)
          : "No expiry",
        icon: Calendar,
      },
      {
        label: "Certificate ID",
        value: record?.certificateId || id || "Not available",
        icon: FileText,
      },
      {
        label: "Issuer Trust",
        value:
          record?.institutionVerificationSnapshot?.status === "verified"
            ? "Verified institution"
            : "Issuer not verified",
        icon: BadgeCheck,
      },
    ],
    [id, metadata, record]
  );

  useEffect(() => {
    const loadCertificate = async () => {
      if (!id) {
        setError("Certificate ID is missing.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const publicRes = await fetch(
          `${getApiBaseUrl()}/api/verify/${id}${
            adminId ? `?admin=${encodeURIComponent(adminId)}` : ""
          }`
        );
        const publicPayload = await publicRes.json().catch(() => null);

        if (!publicRes.ok || !publicPayload?.certificate) {
          throw new Error(publicPayload?.message || "Certificate not found.");
        }

        const certificate = publicPayload.certificate as PublicCertificateRecord;
        setRecord(certificate);

        try {
          const contract = await getReadOnlyContract();
          const chainCertificateId = certificate.chainCertificateId || certificate.certificateId || id;
          const result = await contract.verifyCertificate(
            BigInt(chainCertificateId),
            emptyHash
          );
          const metadataCid = result[1];
          const revoked = result[3];
          setChainRevoked(Boolean(revoked));
          setChainChecked(true);

          if (metadataCid) {
            const metadataRes = await fetch(
              `https://gateway.pinata.cloud/ipfs/${metadataCid}`
            );
            if (metadataRes.ok) {
              setMetadata(await metadataRes.json());
            }
          }
        } catch (chainError) {
          console.warn("Public chain verification failed:", chainError);
          setChainChecked(false);
        }
      } catch (loadError: any) {
        setError("Could not load the certificate. Please check the link and try again.");
        setRecord(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadCertificate();
  }, [adminId, id]);

  if (isLoading) {
    return (
      <main className="container mx-auto px-4 py-16 sm:px-6">
        <div className="surface-card mx-auto flex max-w-xl items-center justify-center gap-3 rounded-lg p-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Loading certificate verification...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container mx-auto px-4 py-16 sm:px-6">
        <div className="surface-card mx-auto max-w-xl rounded-lg p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-destructive" />
          <h1 className="text-2xl font-bold text-foreground">Certificate Not Found</h1>
          <p className="mt-3 text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="surface-card rounded-lg p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="brand-gradient flex h-12 w-12 items-center justify-center rounded-md text-white">
                {isRevoked ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : (
                  <ShieldCheck className="h-6 w-6" />
                )}
              </div>
              <div>
                <p className="section-kicker mb-1">Certificate Verification</p>
                <h1 className="text-3xl font-bold text-foreground">
                  {verificationStatus === "revoked"
                    ? "Certificate Revoked"
                    : verificationStatus === "expired"
                      ? "Certificate Expired"
                      : "Certificate Verified"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {chainChecked
                    ? "Blockchain and certificate record checked."
                    : "Certificate record loaded. Blockchain check is unavailable right now."}
                </p>
              </div>
            </div>

            <div
              className={`rounded-md border px-4 py-3 text-sm font-semibold ${
                isVerified
                  ? "border-primary/35 bg-primary/10 text-primary"
                  : verificationStatus === "revoked"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-secondary/40 bg-secondary/10 text-secondary"
              }`}
            >
              {verificationStatus === "valid"
                ? "Valid Certificate"
                : verificationStatus === "expired"
                  ? "Expired"
                  : "Revoked"}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="surface-card overflow-hidden rounded-lg">
            <div className="border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <FileText className="h-5 w-5 text-primary" />
                Certificate
              </h2>
            </div>
            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                title="Certificate PDF"
                className="h-[720px] w-full bg-background"
              />
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                Certificate PDF is not available.
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="surface-card rounded-lg p-5">
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                {branding.instituteName || "Essential Details"}
              </h2>
              <div className="space-y-3">
                {detailRows.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="rounded-md border border-border bg-background/55 p-3"
                    >
                      <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Icon className="h-4 w-4 text-primary" />
                        {item.label}
                      </div>
                      <p className="font-medium text-foreground">{item.value}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="surface-card rounded-lg p-5">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                <Hash className="h-5 w-5 text-primary" />
                Proof
              </h2>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Blockchain Status</p>
                  <p className="mt-1 font-medium capitalize text-foreground">
                    {isRevoked
                      ? "revoked"
                      : chainChecked
                        ? record?.chainStatus || "confirmed"
                        : "record loaded"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">PDF Hash</p>
                  <p className="mt-1 break-all font-mono text-xs text-foreground">
                    {shortHash(metadata?.fileHash)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Transaction</p>
                  <p className="mt-1 break-all font-mono text-xs text-foreground">
                    {shortHash(record?.blockchainTx)}
                  </p>
                </div>
              </div>
              {pdfUrl && (
                <Button asChild className="mt-5 w-full">
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open PDF
                  </a>
                </Button>
              )}
            </div>

            <div className="rounded-md border border-primary/25 bg-primary/10 p-4 text-sm text-muted-foreground">
              <BadgeCheck className="mb-2 h-5 w-5 text-primary" />
              Share this page with recruiters or reviewers to confirm the certificate.
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
};

export default PublicCertificate;

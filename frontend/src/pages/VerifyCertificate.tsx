import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  Upload,
  Search,
  Hash,
  Calendar,
  User,
  GraduationCap,
  ExternalLink,
  BadgeCheck,
  FileSearch,
  ShieldCheck,
} from "lucide-react";
import CryptoJS from "crypto-js";
import { getReadOnlyContract } from "@/utils/contract";
import { getApiBaseUrl } from "@/utils/api";
import { getCertificateTemplateLabel } from "@/utils/adminSettings";

interface Metadata {
  studentName: string;
  courseName: string;
  issueDate: string;
  expiryDate?: string;
  additionalInfo?: string;
  fileHash: string;
  ipfsPdfHash: string;
}

interface CertificateData {
  id: string;
  metadata?: Metadata;
  isValid: boolean;
  revoked?: boolean;
  verificationStatus?: "valid" | "expired" | "revoked";
}

interface BackendCertificate {
  _id?: string;
  certificateId: string;
  chainCertificateId?: string;
  issuedByAdminId?: string;
  issuedBy?: string;
  issuedByEmail?: string;
  studentName: string;
  studentEmail?: string;
  courseName: string;
  issueDate: string;
  expiryDate?: string;
  ipfsPdfHash: string;
  blockchainTx: string;
  chainStatus?: string;
  emailStatus?: string;
  template?: string;
  revoked?: boolean;
  brandingSnapshot?: Record<string, string>;
}

const VerifyCertificate = () => {
  const [file, setFile] = useState<File | null>(null);
  const [certificateId, setCertificateId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [verificationResult, setVerificationResult] =
    useState<CertificateData | null>(null);
  const [publicRecord, setPublicRecord] = useState<BackendCertificate | null>(null);
  const [ambiguousMatches, setAmbiguousMatches] = useState<BackendCertificate[]>([]);
  const [activeTab, setActiveTab] = useState("file");

  const isExpiredRecord = (record?: BackendCertificate | null) =>
    Boolean(record?.expiryDate && new Date(record.expiryDate).getTime() < Date.now());

  const { id } = useParams();

  // 📂 File upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (uploadedFile) {
      if (uploadedFile.type === "application/pdf") {
        setFile(uploadedFile);
        toast({
          title: "File uploaded successfully",
          description: `${uploadedFile.name} is ready for verification`,
        });
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF file only",
          variant: "destructive",
        });
      }
    }
  };

  // 🔐 Generate SHA256 hash
  const generateHash = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        const uint8 = new Uint8Array(buffer);
        const wordArray = CryptoJS.lib.WordArray.create(uint8 as any);
        const hash = CryptoJS.SHA256(wordArray).toString().toLowerCase();
        resolve(hash);
      };
      reader.readAsArrayBuffer(file);
    });
  };

  // 🌐 Fetch metadata from IPFS
  const fetchMetadataFromIPFS = async (cid: string): Promise<Metadata> => {
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
    if (!res.ok) throw new Error("Could not load certificate details.");
    return res.json();
  };

  const fetchCertificateRecord = async (certId: string) => {
    const token = localStorage.getItem("adminToken");
    if (!token) {
      throw new Error("Please login as an admin before verifying certificates.");
    }

    const publicRes = await fetch(
      `${getApiBaseUrl()}/api/verify/${encodeURIComponent(certId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const publicPayload = await publicRes.json().catch(() => ({}));

    if (publicRes.status === 409 && publicPayload?.ambiguous) {
      const matches = publicPayload.certificates || [];
      setAmbiguousMatches(matches);
      setPublicRecord(null);
      setVerificationResult(null);
      return { ambiguous: true, matches };
    }

    if (!publicRes.ok || !publicPayload?.certificate) {
      throw new Error(publicPayload?.message || "Certificate not found.");
    }

    const record = publicPayload.certificate as BackendCertificate;
    setPublicRecord(record);
    setAmbiguousMatches([]);
    return { ambiguous: false, record };
  };

  const verifyBackendRecordById = async (record: BackendCertificate) => {
    const chainCertId = record.chainCertificateId || record.certificateId;
    const contract = await getReadOnlyContract();
    const emptyHash = "0x" + "0".repeat(64);
    const result = await contract.verifyCertificate(BigInt(chainCertId), emptyHash);

    const matched = result[0];
    const metadataCID = result[1];
    const revoked = result[3];

    if (!matched) throw new Error("Invalid certificate ID");

    const metadata = await fetchMetadataFromIPFS(metadataCID);
    const isExpired = isExpiredRecord(record);

    setPublicRecord(record);
    setVerificationResult({
      id: record.certificateId,
      metadata,
      isValid: !revoked && !isExpired,
      revoked,
    });

    toast({
      title: revoked
        ? "Certificate revoked"
        : isExpired
          ? "Certificate expired"
          : "Certificate found",
      description: revoked
        ? "This certificate has been revoked."
        : isExpired
          ? "This certificate record exists but is expired."
          : "Certificate details loaded successfully.",
      variant: revoked || isExpired ? "destructive" : "default",
    });
  };

  // ✅ Verify by ID + file hash
  const verifyCertificate = async (
    certId: string,
    fileHash: string,
    chainCertId = certId,
    backendRecord: BackendCertificate | null = publicRecord
  ) => {
    try {
      const contract = await getReadOnlyContract();

      const normalizedHash = fileHash.toLowerCase();
      const result = await contract.verifyCertificate(
        BigInt(chainCertId),
        `0x${normalizedHash}`
      );

      const matched = result[0];
      const metadataCID = result[1];
      const revoked = result[3];

      if (!matched) {
        throw new Error("Certificate hash does not match blockchain record");
      }

      const metadata = await fetchMetadataFromIPFS(metadataCID);
      const isExpired = isExpiredRecord(backendRecord);
      const isValid =
        !revoked && !isExpired && metadata.fileHash.toLowerCase() === normalizedHash;

      setVerificationResult({
        id: certId,
        metadata,
        isValid,
        revoked,
      });

      toast({
        title: isValid
          ? "Certificate verified!"
          : isExpired
            ? "Certificate expired"
            : "Certificate invalid or revoked",
        description: isValid
          ? "This certificate is authentic and valid."
          : isExpired
            ? "This certificate has passed its expiry date."
            : "The certificate was revoked or modified.",
        variant: isValid ? "default" : "destructive",
      });
    } catch (err: any) {
      console.error("Verification error:", err);
      const errorMsg = err?.reason || err?.message || "";

      let friendlyMessage = "Verification failed.";
      if (errorMsg.includes("does not match"))
        friendlyMessage = "File hash does not match blockchain record.";
      else if (errorMsg.includes("Invalid certificate ID"))
        friendlyMessage = "No certificate found with this ID.";

      toast({
        title: "Verification Failed",
        description: friendlyMessage,
        variant: "destructive",
      });
    }
  };

  // 📑 Verify using file
  const verifyByFile = async () => {
    if (!file || !certificateId.trim()) {
      toast({
        title: "Missing details",
        description: "Upload a file and enter Certificate ID",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      const rawHash = await generateHash(file);
      const lookup = await fetchCertificateRecord(certificateId);

      if (lookup.ambiguous) {
        toast({
          title: "Choose issuing institution",
          description:
            "More than one admin has this certificate ID. Select the correct record below.",
        });
        return;
      }

      const backendRecord = lookup.record || null;
      const chainCertId =
        backendRecord?.chainCertificateId || backendRecord?.certificateId || certificateId;

      await verifyCertificate(certificateId, rawHash, chainCertId, backendRecord);
    } finally {
      setIsLoading(false);
    }
  };

  // 🔎 Verify using ID only (no file)
  const verifyById = async (idToVerify?: string) => {
    const certId = idToVerify || certificateId;
    if (!certId.trim()) {
      toast({
        title: "Missing certificate ID",
        description: "Please enter a certificate ID",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const lookup = await fetchCertificateRecord(certId);

      if (lookup.ambiguous) {
        toast({
          title: "Choose issuing institution",
          description:
            "More than one admin has this certificate ID. Select the correct record below.",
        });
        return;
      }

      await verifyBackendRecordById(lookup.record);
    } catch (err: any) {
      console.error("Lookup error:", err);

      const errorMsg = err?.reason || err?.message || "";
      const isInvalidId =
        errorMsg.includes("Invalid certificate ID") ||
        errorMsg.includes("invalid BigInt") ||
        errorMsg.includes("reverted");

      toast({
        title: isInvalidId ? "Invalid Certificate ID" : "Lookup Failed",
        description: isInvalidId
          ? "No certificate found with this ID. Please check and try again."
          : "Something went wrong while verifying the certificate.",
        variant: "destructive",
      });
      setPublicRecord(null);
    } finally {
      setIsLoading(false);
    }
  };

  const verifySelectedMatch = async (record: BackendCertificate) => {
    setCertificateId(record.certificateId);
    setAmbiguousMatches([]);
    setIsLoading(true);
    try {
      if (activeTab === "file" && file) {
        const rawHash = await generateHash(file);
        await verifyCertificate(
          record.certificateId,
          rawHash,
          record.chainCertificateId || record.certificateId,
          record
        );
      } else {
        await verifyBackendRecordById(record);
      }
    } catch (error: any) {
      toast({
        title: "Lookup Failed",
        description: error?.message || "Could not verify the selected record.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 🚀 Auto-verify if /verify/:id is in URL
  useEffect(() => {
    if (id) {
      setCertificateId(id);
      verifyById(id);
    }
  }, [id]);

  return (
    <div className="container mx-auto px-4 py-10 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="space-y-5">
          <div className="surface-card rounded-lg p-6">
            <p className="section-kicker mb-3">Admin Verification</p>
            <h1 className="text-4xl font-bold leading-tight text-foreground">
              Verify certificate proof
            </h1>
            <p className="mt-4 text-muted-foreground">
              Check a certificate ID or match an uploaded PDF against the
              blockchain registry.
            </p>
          </div>

          <div className="surface-card rounded-lg p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="brand-gradient flex h-10 w-10 items-center justify-center rounded-md text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Proof checks</p>
                <p className="text-sm text-muted-foreground">ID lookup or file hash</p>
              </div>
            </div>
            <div className="grid gap-3">
              <div className="rounded-md border border-border bg-background/55 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <BadgeCheck className="h-4 w-4 text-primary" />
                  Certificate ID
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Loads the record and revocation status.
                </p>
              </div>
              <div className="rounded-md border border-border bg-background/55 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Hash className="h-4 w-4 text-accent" />
                  PDF hash
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Confirms the uploaded file matches the chain record.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-8">
          <Card className="surface-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSearch className="h-5 w-5 text-primary" />
                Certificate Verification
              </CardTitle>
              <CardDescription>
                Upload a certificate file or enter the certificate ID.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2 bg-background/70">
                  <TabsTrigger value="file">Upload File</TabsTrigger>
                  <TabsTrigger value="id">Certificate ID</TabsTrigger>
                </TabsList>

                <TabsContent value="file" className="mt-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="verify-file-upload">
                        Certificate File (PDF)
                      </Label>
                      <div className="rounded-lg border-2 border-dashed border-border bg-background/70 p-6 text-center transition-colors hover:border-primary/50">
                        <input
                          id="verify-file-upload"
                          type="file"
                          accept=".pdf"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <label
                          htmlFor="verify-file-upload"
                          className="cursor-pointer"
                        >
                          <Upload className="mx-auto mb-2 h-8 w-8 text-primary" />
                          <p className="text-sm text-muted-foreground">
                            {file ? file.name : "Click to upload PDF certificate"}
                          </p>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Certificate ID *</Label>
                      <Input
                        value={certificateId}
                        onChange={(e) => setCertificateId(e.target.value)}
                        placeholder="Enter certificate ID"
                        required
                        className="bg-background/70"
                      />
                    </div>

                    <Button
                      onClick={verifyByFile}
                      disabled={isLoading}
                      className="w-full shadow-[var(--glow-primary)]"
                    >
                      {isLoading ? "Verifying..." : "Verify Certificate"}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="id" className="mt-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Certificate ID *</Label>
                      <Input
                        value={certificateId}
                        onChange={(e) => setCertificateId(e.target.value)}
                        placeholder="Enter certificate ID"
                        required
                        className="bg-background/70"
                      />
                    </div>

                    <Button
                      onClick={() => verifyById()}
                      disabled={isLoading}
                      className="w-full shadow-[var(--glow-primary)]"
                    >
                      {isLoading ? "Looking up..." : "Lookup Certificate"}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {ambiguousMatches.length > 0 && (
            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-primary" />
                  Choose Issuing Institution
                </CardTitle>
                <CardDescription>
                  Certificate ID {certificateId} exists under more than one admin.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {ambiguousMatches.map((record) => (
                  <button
                    key={`${record.issuedByAdminId || record._id}-${record.chainCertificateId || record.certificateId}`}
                    type="button"
                    onClick={() => verifySelectedMatch(record)}
                    disabled={isLoading}
                    className="rounded-md border border-border bg-background/55 p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-60"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-foreground">
                          {record.brandingSnapshot?.instituteName ||
                            record.issuedBy ||
                            "Unknown institution"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {record.studentName} - {record.courseName}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Issued{" "}
                          {record.issueDate
                            ? new Date(record.issueDate).toLocaleDateString()
                            : "date unavailable"}
                        </p>
                      </div>
                      <span className="rounded-md border border-primary/35 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        Verify this record
                      </span>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {verificationResult && (
            <Card className="surface-card">
              <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-5 w-5 text-primary" />
                Verification Result
              </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
              {publicRecord && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border border-border bg-background/55 p-3 text-sm">
                    <p className="text-muted-foreground">Record Status</p>
                    <p className="font-medium text-foreground">
                      {publicRecord.revoked
                        ? "Revoked"
                        : isExpiredRecord(publicRecord)
                          ? "Expired"
                          : "Valid"}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-background/55 p-3 text-sm">
                    <p className="text-muted-foreground">Blockchain</p>
                    <p className="font-medium capitalize text-foreground">
                      {publicRecord.chainStatus || "confirmed"}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-background/55 p-3 text-sm">
                    <p className="text-muted-foreground">Template</p>
                    <p className="font-medium capitalize text-foreground">
                      {getCertificateTemplateLabel(publicRecord.template)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-background/55 p-3 text-sm">
                    <p className="text-muted-foreground">Expiry</p>
                    <p className="font-medium text-foreground">
                      {publicRecord.expiryDate
                        ? new Date(publicRecord.expiryDate).toLocaleDateString()
                        : "No expiry"}
                    </p>
                  </div>
                </div>
              )}
              {verificationResult.metadata ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-border bg-background/55 p-3 text-sm">
                      <User className="mb-2 h-4 w-4 text-primary" />
                      <p className="text-muted-foreground">Student</p>
                      <p className="font-medium text-foreground">
                        {verificationResult.metadata.studentName}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-background/55 p-3 text-sm">
                      <GraduationCap className="mb-2 h-4 w-4 text-accent" />
                      <p className="text-muted-foreground">Course</p>
                      <p className="font-medium text-foreground">
                        {verificationResult.metadata.courseName}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-background/55 p-3 text-sm">
                      <Calendar className="mb-2 h-4 w-4 text-blockchain-accent" />
                      <p className="text-muted-foreground">Issued</p>
                      <p className="font-medium text-foreground">
                        {verificationResult.metadata.issueDate}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <ExternalLink className="h-4 w-4" />
                    <a
                      href={`https://gateway.pinata.cloud/ipfs/${verificationResult.metadata.ipfsPdfHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      View Certificate PDF
                    </a>
                  </div>

                  {/* Inline PDF Preview */}
                  <iframe
                    src={`https://gateway.pinata.cloud/ipfs/${verificationResult.metadata.ipfsPdfHash}`}
                    className="mt-4 h-[600px] w-full rounded-lg border border-border bg-background"
                  />
                </>
              ) : (
                <p>No metadata found for this certificate.</p>
              )}
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
};

export default VerifyCertificate;

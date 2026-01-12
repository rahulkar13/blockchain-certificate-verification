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
} from "lucide-react";
import CryptoJS from "crypto-js";
import { getContract } from "@/utils/contract";

interface Metadata {
  studentName: string;
  courseName: string;
  issueDate: string;
  additionalInfo?: string;
  fileHash: string;
  ipfsPdfHash: string;
}

interface CertificateData {
  id: string;
  metadata?: Metadata;
  isValid: boolean;
  revoked?: boolean;
}

const VerifyCertificate = () => {
  const [file, setFile] = useState<File | null>(null);
  const [certificateId, setCertificateId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [verificationResult, setVerificationResult] =
    useState<CertificateData | null>(null);
  const [activeTab, setActiveTab] = useState("file");

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
    if (!res.ok) throw new Error("Failed to fetch metadata from IPFS");
    return res.json();
  };

  // ✅ Verify by ID + file hash
  const verifyCertificate = async (certId: string, fileHash: string) => {
    try {
      const contract = await getContract();
      if (!contract) throw new Error("Smart contract not available");

      const normalizedHash = fileHash.toLowerCase();
      const result = await contract.verifyCertificate(
        BigInt(certId),
        `0x${normalizedHash}`
      );

      const matched = result[0];
      const metadataCID = result[1];
      const revoked = result[3];

      if (!matched) {
        throw new Error("Certificate hash does not match blockchain record");
      }

      const metadata = await fetchMetadataFromIPFS(metadataCID);
      const isValid =
        !revoked && metadata.fileHash.toLowerCase() === normalizedHash;

      setVerificationResult({
        id: certId,
        metadata,
        isValid,
        revoked,
      });

      toast({
        title: isValid
          ? "✅ Certificate verified!"
          : "❌ Certificate invalid or revoked",
        description: isValid
          ? "This certificate is authentic and valid."
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
      await verifyCertificate(certificateId, rawHash);
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
      const contract = await getContract();
      if (!contract) throw new Error("Smart contract not available");

      const emptyHash = "0x" + "0".repeat(64);
      const result = await contract.verifyCertificate(BigInt(certId), emptyHash);

      const matched = result[0];
      const metadataCID = result[1];
      const revoked = result[3];

      if (!matched) throw new Error("Invalid certificate ID");

      const metadata = await fetchMetadataFromIPFS(metadataCID);

      setVerificationResult({
        id: certId,
        metadata,
        isValid: !revoked,
        revoked,
      });

      toast({
        title: revoked ? "⚠️ Certificate revoked" : "✅ Certificate found",
        description: revoked
          ? "This certificate has been revoked."
          : "Certificate details loaded successfully.",
        variant: revoked ? "destructive" : "default",
      });
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
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blockchain-primary to-blockchain-secondary bg-clip-text text-transparent mb-4">
            Verify Certificate
          </h1>
          <p className="text-muted-foreground text-lg">
            Verify the authenticity of academic certificates on the blockchain
          </p>
        </div>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-blockchain-primary" />
              Certificate Verification
            </CardTitle>
            <CardDescription>
              Upload a certificate file or enter the certificate ID
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="file">Upload File</TabsTrigger>
                <TabsTrigger value="id">Certificate ID</TabsTrigger>
              </TabsList>

              {/* Verify by File */}
              <TabsContent value="file" className="mt-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="verify-file-upload">
                      Certificate File (PDF)
                    </Label>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-blockchain-primary/50 transition-colors">
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
                        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
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
                    />
                  </div>

                  <Button
                    onClick={verifyByFile}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-blockchain-primary to-blockchain-secondary"
                  >
                    {isLoading ? "Verifying..." : "Verify Certificate"}
                  </Button>
                </div>
              </TabsContent>

              {/* Verify by ID */}
              <TabsContent value="id" className="mt-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Certificate ID *</Label>
                    <Input
                      value={certificateId}
                      onChange={(e) => setCertificateId(e.target.value)}
                      placeholder="Enter certificate ID"
                      required
                    />
                  </div>

                  <Button
                    onClick={() => verifyById()}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-blockchain-primary to-blockchain-secondary"
                  >
                    {isLoading ? "Looking up..." : "Lookup Certificate"}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Verification Result */}
        {verificationResult && (
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-5 w-5 text-blockchain-primary" />
                Verification Result
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {verificationResult.metadata ? (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4" />
                    <span>
                      Student: {verificationResult.metadata.studentName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <GraduationCap className="h-4 w-4" />
                    <span>
                      Course: {verificationResult.metadata.courseName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Issued: {verificationResult.metadata.issueDate}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <ExternalLink className="h-4 w-4" />
                    <a
                      href={`https://gateway.pinata.cloud/ipfs/${verificationResult.metadata.ipfsPdfHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 underline"
                    >
                      View Certificate PDF
                    </a>
                  </div>

                  {/* Inline PDF Preview */}
                  <iframe
                    src={`https://gateway.pinata.cloud/ipfs/${verificationResult.metadata.ipfsPdfHash}`}
                    className="w-full h-[600px] border rounded-lg mt-4"
                  />
                </>
              ) : (
                <p>No metadata found for this certificate.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VerifyCertificate;

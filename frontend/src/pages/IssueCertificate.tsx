

import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import CertificateForm from "@/components/CertificateForm";
import LoaderOverlay from "@/components/LoaderOverlay";

import { getNextCertificateId } from "@/utils/idGenerator";
import { generateFileHash } from "@/utils/hash";
import { uploadFileToPinata, uploadMetadataToPinata } from "@/utils/pinata";
import { generateCertificatePDF } from "@/utils/pdfGenerator";
import { issueCertificateOnBlockchain } from "@/utils/issueBlockchain";
import { saveToBackend } from "@/utils/saveToBackend";

export default function IssueCertificate() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: any) => {
  try {
    setLoading(true);

    console.time("TOTAL TIME");

    console.time("STEP 1 - Get Next Cert ID");
    const certId = await getNextCertificateId();
    console.timeEnd("STEP 1 - Get Next Cert ID");

    console.time("STEP 2 - Generate PDF");
    const pdf = await generateCertificatePDF(data, certId);
    console.timeEnd("STEP 2 - Generate PDF");

    const fileName = `${data.studentName.replace(/\s+/g, "_")}_Certificate.pdf`;

    console.time("STEP 3 - Hash PDF");
    const hash = await generateFileHash(pdf);
    console.timeEnd("STEP 3 - Hash PDF");

    console.time("STEP 4 - Upload PDF to PINATA");
    const pdfCid = await uploadFileToPinata(pdf);
    console.timeEnd("STEP 4 - Upload PDF to PINATA");

    console.time("STEP 5 - Upload Metadata to PINATA");
    const metadataCid = await uploadMetadataToPinata({
      ...data,
      fileName,
      fileHash: hash,
      ipfsPdfHash: pdfCid,
    });
    console.timeEnd("STEP 5 - Upload Metadata to PINATA");

    console.time("STEP 6 - Blockchain Transaction");
    const tx = await issueCertificateOnBlockchain(certId, hash, metadataCid);
    await tx.wait();
    console.timeEnd("STEP 6 - Blockchain Transaction");

    console.time("STEP 7 - Save To Backend");
    await saveToBackend(data, certId, pdfCid, tx.hash, fileName);
    console.timeEnd("STEP 7 - Save To Backend");

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
      description: `Certificate ${certId} issued successfully.`,
    });

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


  return (
    <div className="container mx-auto py-8 px-40">
       <div className="max-w-2xl mx-auto">
         <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blockchain-primary to-blockchain-secondary bg-clip-text text-transparent mb-4">
            Issue Certificate
           </h1>
           <p className="text-muted-foreground text-lg">
             Auto-generate ID, create certificate, and issue on blockchain
           </p>
         </div>
      </div>
      <CertificateForm onSubmit={handleSubmit} isLoading={loading} />
      {loading && <LoaderOverlay />}
    </div>
  );
}

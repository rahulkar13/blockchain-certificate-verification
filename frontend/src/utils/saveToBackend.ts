import { getApiBaseUrl } from "@/utils/api";
import { loadAdminPreferences } from "@/utils/adminSettings";

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read certificate PDF."));
    reader.readAsDataURL(file);
  });

const shouldAutoSendEmail = () => {
  return loadAdminPreferences().autoSendEmail !== false;
};

const shouldIncludePublicVerifyLink = () => {
  return loadAdminPreferences().includePublicVerifyLink !== false;
};

export const saveToBackend = async (
  data: any,
  certId: string,
  pdfCid: string,
  fileName: string,
  pdfFile: File,
  fileHash: string,
  metadataCid: string,
  options: { allowDuplicate?: boolean } = {}
) => {
  const token = localStorage.getItem("adminToken");
  const pdfBase64 = await fileToBase64(pdfFile);
  const sendEmail = shouldAutoSendEmail();
  const includePublicVerifyLink = shouldIncludePublicVerifyLink();

  const response = await fetch(`${getApiBaseUrl()}/api/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      certificateId: certId,
      studentName: data.studentName,
      studentEmail: data.studentEmail,
      courseName: data.courseName,
      issueDate: data.issueDate,
      expiryDate: data.expiryDate,
      template: data.template,
      certificateText: data.certificateText,
      branding: data.branding,
      ipfsPdfHash: pdfCid,
      fileHash,
      metadataCid,
      allowDuplicate: options.allowDuplicate === true,
      sendEmail,
      includePublicVerifyLink,
      pdfFileName: fileName, // <-- IMPORTANT
      pdfBase64,
      issuedBy: "Admin",
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || "Failed to save certificate to backend.");
  }

  return payload;
};

type BatchCertificateRecord = {
  data: any;
  certId: string;
  pdfCid: string;
  fileName: string;
  pdfFile: File;
  fileHash: string;
  metadataCid?: string;
};

export const saveBatchToBackend = async (
  records: BatchCertificateRecord[],
  options: { allowDuplicate?: boolean } = {}
) => {
  const token = localStorage.getItem("adminToken");
  const sendEmail = shouldAutoSendEmail();
  const includePublicVerifyLink = shouldIncludePublicVerifyLink();
  const certificates = await Promise.all(
    records.map(async (record) => ({
      certificateId: record.certId,
      studentName: record.data.studentName,
      studentEmail: record.data.studentEmail,
      courseName: record.data.courseName,
      issueDate: record.data.issueDate,
      expiryDate: record.data.expiryDate,
      template: record.data.template,
      additionalInfo: record.data.additionalInfo,
      certificateText: record.data.certificateText,
      branding: record.data.branding,
      ipfsPdfHash: record.pdfCid,
      metadataCid: record.metadataCid,
      fileHash: record.fileHash,
      pdfFileName: record.fileName,
      pdfBase64: await fileToBase64(record.pdfFile),
      issuedBy: "Admin",
    }))
  );

  const response = await fetch(`${getApiBaseUrl()}/api/issue/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      certificates,
      sendEmail,
      includePublicVerifyLink,
      allowDuplicate: options.allowDuplicate === true,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message || "Failed to save batch certificates.");
  }

  return payload;
};

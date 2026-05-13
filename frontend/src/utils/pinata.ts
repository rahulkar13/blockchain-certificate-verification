import { getApiBaseUrl } from "@/utils/api";

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] || "");
    };

    reader.readAsDataURL(blob);
  });
};

const getAuthHeaders = () => {
  const token = localStorage.getItem("adminToken");

  if (!token) {
    throw new Error("Please sign in before uploading certificate files.");
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

export const uploadFileToPinata = async (file: File | Blob): Promise<string> => {
  const dataBase64 = await blobToBase64(file);
  const response = await fetch(`${getApiBaseUrl()}/api/ipfs/file`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      fileName: file instanceof File ? file.name : `certificate_${Date.now()}.pdf`,
      mimeType: file.type || "application/pdf",
      dataBase64,
    }),
  });

  if (!response.ok) {
    throw new Error("Could not upload the certificate file. Please try again.");
  }

  const data = await response.json();
  return data.cid;
};

export const uploadMetadataToPinata = async (metadata: any): Promise<string> => {
  const response = await fetch(`${getApiBaseUrl()}/api/ipfs/metadata`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    throw new Error("Could not save certificate details. Please try again.");
  }

  const data = await response.json();
  return data.cid;
};

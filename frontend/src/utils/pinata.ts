const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY;
const PINATA_SECRET_KEY = import.meta.env.VITE_PINATA_SECRET_KEY;

// ⭐ Ultra-fast file upload to IPFS
export const uploadFileToPinata = async (file: File | Blob): Promise<string> => {
  const url = "https://api.pinata.cloud/pinning/pinFileToIPFS";

  const formData = new FormData();
  formData.append("file", file);

  // Add metadata (helps Pinata process faster)
  formData.append(
    "pinataMetadata",
    JSON.stringify({
      name: `certificate_${Date.now()}`,
    })
  );

  // Add options (faster pinning)
  formData.append(
    "pinataOptions",
    JSON.stringify({
      cidVersion: 1,
    })
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      pinata_api_key: PINATA_API_KEY!,
      pinata_secret_api_key: PINATA_SECRET_KEY!,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Pinata Upload Error:", errText);
    throw new Error("Failed to upload file to Pinata");
  }

  const data = await response.json();
  return data.IpfsHash;
};

// ⭐ Ultra-fast JSON metadata upload
export const uploadMetadataToPinata = async (metadata: any): Promise<string> => {
  const blob = new Blob([JSON.stringify(metadata)], {
    type: "application/json",
  });
  
  return await uploadFileToPinata(blob);
};

import express from "express";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
const PINATA_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

const getPinataHeaders = () => {
  const apiKey = process.env.PINATA_API_KEY;
  const secretKey = process.env.PINATA_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error("Pinata API keys are missing in backend .env");
  }

  return {
    pinata_api_key: apiKey,
    pinata_secret_api_key: secretKey,
  };
};

const uploadBlobToPinata = async (blob, fileName) => {
  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append(
    "pinataMetadata",
    JSON.stringify({
      name: fileName || `certificate_${Date.now()}`,
    })
  );
  formData.append(
    "pinataOptions",
    JSON.stringify({
      cidVersion: 1,
    })
  );

  const response = await fetch(PINATA_FILE_URL, {
    method: "POST",
    headers: getPinataHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Pinata upload failed: ${details}`);
  }

  const data = await response.json();
  return data.IpfsHash;
};

router.post("/file", protect, async (req, res) => {
  try {
    const { fileName, mimeType, dataBase64 } = req.body;

    if (!dataBase64) {
      return res.status(400).json({ message: "File data is required" });
    }

    const buffer = Buffer.from(dataBase64, "base64");
    const blob = new Blob([buffer], {
      type: mimeType || "application/octet-stream",
    });
    const cid = await uploadBlobToPinata(blob, fileName);

    res.json({ cid });
  } catch (error) {
    console.error("IPFS file upload error:", error);
    res.status(500).json({ message: "Failed to upload file to IPFS" });
  }
});

router.post("/metadata", protect, async (req, res) => {
  try {
    const blob = new Blob([JSON.stringify(req.body)], {
      type: "application/json",
    });
    const cid = await uploadBlobToPinata(blob, `metadata_${Date.now()}.json`);

    res.json({ cid });
  } catch (error) {
    console.error("IPFS metadata upload error:", error);
    res.status(500).json({ message: "Failed to upload metadata to IPFS" });
  }
});

export default router;

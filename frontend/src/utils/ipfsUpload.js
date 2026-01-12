import axios from "axios";

// Replace with your own Pinata API keys
const PINATA_API_KEY = "YOUR_PINATA_API_KEY";
const PINATA_SECRET_KEY = "YOUR_PINATA_SECRET_KEY";

/**
 * Uploads a file to IPFS via Pinata
 * @param {File} file - File to upload
 * @returns {Promise<string>} CID of uploaded file
 */
export async function uploadToIPFS(file) {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
      maxBodyLength: "Infinity",
      headers: {
        "Content-Type": `multipart/form-data`,
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    });

    return res.data.IpfsHash; // CID only
  } catch (err) {
    console.error("IPFS upload failed:", err);
    throw err;
  }
}

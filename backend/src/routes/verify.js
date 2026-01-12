import express from "express";
import Certificate from "../models/Certificate.js";

const router = express.Router();

/**
 * Verify certificate by certificateId or IPFS hash
 * Endpoint: POST /api/verify
 */
router.post("/", async (req, res) => {
  try {
    const { certificateId, ipfsPdfHash } = req.body;

    if (!certificateId && !ipfsPdfHash) {
      return res.status(400).json({
        message: "Please provide certificateId or ipfsPdfHash",
      });
    }

    // Find certificate by ID or IPFS hash
    const certificate = await Certificate.findOne({
      $or: [{ certificateId }, { ipfsPdfHash }],
    });

    if (!certificate) {
      return res.status(404).json({
        verified: false,
        message: "Certificate not found in the system.",
      });
    }

    res.status(200).json({
      verified: true,
      message: "Certificate verified successfully.",
      certificate,
    });
  } catch (error) {
    console.error("Certificate verification error:", error);
    res.status(500).json({
      message: "Server error while verifying certificate",
    });
  }
});

/**
 * Public route: fetch certificate by ID (for QR code)
 * Endpoint: GET /api/verify/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const certificate = await Certificate.findOne({
      certificateId: req.params.id,
    });

    if (!certificate) {
      return res.status(404).json({
        verified: false,
        message: "Certificate not found.",
      });
    }

    res.status(200).json({
      verified: true,
      message: "Certificate found.",
      certificate,
    });
  } catch (error) {
    console.error("Error fetching certificate by ID:", error);
    res.status(500).json({
      message: "Server error fetching certificate",
    });
  }
});

export default router;

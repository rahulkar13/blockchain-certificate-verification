import express from "express";
import Certificate from "../models/Certificate.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

//Issue a new certificate
 
router.post("/", protect, async (req, res) => {
  try {
    const {
      certificateId,
      studentName,
      courseName,
      issueDate,
      ipfsPdfHash,
      blockchainTx,
      issuedBy,
      pdfFileName,
    } = req.body;

    // Validate required fields
    if (
      !certificateId ||
      !studentName ||
      !courseName ||
      !issueDate ||
      !ipfsPdfHash ||
      !blockchainTx
    ) {
      return res.status(400).json({
        success: false,
        message: "All certificate fields are required.",
      });
    }

    // Check for duplicate certificate ID
    const existingCert = await Certificate.findOne({ certificateId });
    if (existingCert) {
      return res.status(400).json({
        success: false,
        message: `Certificate ID "${certificateId}" already exists.`,
      });
    }

    // Save certificate
    const newCertificate = await Certificate.create({
      certificateId,
      studentName,
      courseName,
      issueDate,
      ipfsPdfHash,
      blockchainTx,
      issuedBy: issuedBy || req.admin?.name || "Unknown Admin",
      pdfFileName,
    });

    console.log(`New certificate issued: ${certificateId}`);

    res.status(201).json({
      success: true,
      message: "Certificate issued successfully",
      certificate: {
        id: newCertificate._id,
        certificateId: newCertificate.certificateId,
        studentName: newCertificate.studentName,
        courseName: newCertificate.courseName,
        issueDate: newCertificate.issueDate,
        ipfsPdfHash: newCertificate.ipfsPdfHash,
        blockchainTx: newCertificate.blockchainTx,
        pdfFileName: newCertificate.pdfFileName,
        issuedBy: newCertificate.issuedBy,
        createdAt: newCertificate.createdAt,
      },
    });
  } catch (error) {
    console.error("Certificate issue error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while issuing certificate.",
      error: error.message,
    });
  }
});


 // Get last 10 issued certificates 
 
router.get("/recent", protect, async (req, res) => {
  try {
    const recentCertificates = await Certificate.find()
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      count: recentCertificates.length,
      certificates: recentCertificates,
    });
  } catch (error) {
    console.error("Fetch recent certificates error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recent certificates.",
      error: error.message,
    });
  }
});


router.get("/all", protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const searchQuery = req.query.search
      ? {
          $or: [
            { studentName: { $regex: req.query.search, $options: "i" } },
            { courseName: { $regex: req.query.search, $options: "i" } },
            { certificateId: { $regex: req.query.search, $options: "i" } },
          ],
        }
      : {};

    const [certificates, total] = await Promise.all([
      Certificate.find(searchQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-__v"),
      Certificate.countDocuments(searchQuery),
    ]);

    const formatted = certificates.map((cert) => ({
      certificateId: cert.certificateId,
      studentName: cert.studentName,
      courseName: cert.courseName,
      issueDate: new Date(cert.issueDate).toISOString().split("T")[0],
      issuedBy: cert.issuedBy || "Admin",
      ipfsPdfHash: cert.ipfsPdfHash,
      blockchainTx: cert.blockchainTx,
      pdfFileName: cert.pdfFileName,
    }));

    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      certificates: formatted,
    });
  } catch (error) {
    console.error("Fetch all certificates error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch certificates.",
      error: error.message,
    });
  }
});

export default router;

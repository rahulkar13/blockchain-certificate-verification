import express from "express";
import Certificate from "../models/Certificate.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

const getCertificateStatus = (certificate) => {
  if (certificate.revoked) return "revoked";
  if (certificate.expiryDate && new Date(certificate.expiryDate).getTime() < Date.now()) {
    return "expired";
  }
  return "valid";
};

const buildCertificatePayload = (certificate) => {
  const payload =
    typeof certificate.toObject === "function" ? certificate.toObject() : certificate;
  return {
    ...payload,
    verificationStatus: getCertificateStatus(payload),
  };
};

const buildCertificateSummary = (certificate) => {
  const payload = buildCertificatePayload(certificate);
  return {
    _id: payload._id,
    certificateId: payload.certificateId,
    chainCertificateId: payload.chainCertificateId,
    issuedByAdminId: payload.issuedByAdminId,
    issuedBy: payload.issuedBy,
    issuedByEmail: payload.issuedByEmail,
    studentName: payload.studentName,
    courseName: payload.courseName,
    issueDate: payload.issueDate,
    revoked: payload.revoked,
    verificationStatus: payload.verificationStatus,
    brandingSnapshot: payload.brandingSnapshot || {},
  };
};

const sendAmbiguousCertificateResponse = (res, certificates) =>
  res.status(409).json({
    verified: false,
    ambiguous: true,
    message:
      "Multiple certificates use this certificate ID. Choose the issuing institution to verify the correct record.",
    certificates: certificates.map(buildCertificateSummary),
  });

const getAuthenticatedCertificateScope = (req) =>
  req.admin?.role === "super_admin" ? {} : { issuedByAdminId: req.admin._id };

/**
 * Verify certificate by certificateId or IPFS hash
 * Endpoint: POST /api/verify
 */
router.post("/", protect, async (req, res) => {
  try {
    const { certificateId, ipfsPdfHash } = req.body;

    if (!certificateId && !ipfsPdfHash) {
      return res.status(400).json({
        message: "Please provide certificateId or ipfsPdfHash",
      });
    }

    const adminScope = getAuthenticatedCertificateScope(req);
    let certificate = null;

    if (ipfsPdfHash) {
      certificate = await Certificate.findOne({
        ...adminScope,
        ipfsPdfHash,
        ...(certificateId ? { certificateId } : {}),
      }).sort({ createdAt: -1 });
    } else {
      const certificates = await Certificate.find({
        ...adminScope,
        certificateId,
      })
        .sort({ createdAt: -1 })
        .limit(20);

      if (req.admin?.role === "super_admin" && certificates.length > 1) {
        return sendAmbiguousCertificateResponse(res, certificates);
      }

      certificate = certificates[0];
    }

    if (!certificate) {
      return res.status(404).json({
        verified: false,
        message: "Certificate not found in the system.",
      });
    }

    const certificatePayload = buildCertificatePayload(certificate);

    res.status(200).json({
      verified: certificatePayload.verificationStatus === "valid",
      status: certificatePayload.verificationStatus,
      message:
        certificatePayload.verificationStatus === "valid"
          ? "Certificate verified successfully."
          : `Certificate is ${certificatePayload.verificationStatus}.`,
      certificate: certificatePayload,
    });
  } catch (error) {
    console.error("Certificate verification error:", error);
    res.status(500).json({
      message: "Could not verify the certificate. Please try again.",
    });
  }
});

/**
 * Protected route: fetch certificate by ID
 * Endpoint: GET /api/verify/:id
 */
router.get("/:id", protect, async (req, res) => {
  try {
    const adminScope = getAuthenticatedCertificateScope(req);
    const certificates = await Certificate.find({
      ...adminScope,
      certificateId: req.params.id,
    })
      .sort({ createdAt: -1 })
      .limit(20);

    if (req.admin?.role === "super_admin" && certificates.length > 1) {
      return sendAmbiguousCertificateResponse(res, certificates);
    }

    const certificate = certificates[0];

    if (!certificate) {
      return res.status(404).json({
        verified: false,
        message: "Certificate not found.",
      });
    }

    const certificatePayload = buildCertificatePayload(certificate);

    res.status(200).json({
      verified: certificatePayload.verificationStatus === "valid",
      status: certificatePayload.verificationStatus,
      message:
        certificatePayload.verificationStatus === "valid"
          ? "Certificate found."
          : `Certificate is ${certificatePayload.verificationStatus}.`,
      certificate: certificatePayload,
    });
  } catch (error) {
    console.error("Error fetching certificate by ID:", error);
    res.status(500).json({
      message: "Could not load the certificate. Please try again.",
    });
  }
});

export default router;

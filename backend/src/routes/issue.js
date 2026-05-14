import express from "express";
import Admin from "../models/Admin.js";
import Certificate from "../models/Certificate.js";
import ActivityLog from "../models/ActivityLog.js";
import { adminOnly, protect } from "../middleware/authMiddleware.js";
import { sendCertificateEmail } from "../utils/emailService.js";
import { waitForTransactionReceipt } from "../utils/chainReceipt.js";
import { logActivity } from "../utils/activityLogger.js";
import {
  issueCertificateWithPlatformWallet,
  issueCertificatesWithPlatformWallet,
  revokeCertificateWithPlatformWallet,
} from "../utils/platformWallet.js";

const router = express.Router();

const isValidEmail = (email = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());

const allowedTemplates = ["completion", "internship", "participation"];
const normalizeCertificateTemplate = (template = "") =>
  template === "achievement" || !allowedTemplates.includes(template) ? "completion" : template;
const planActiveStatuses = ["trial", "active"];

const normalizePlan = (plan = {}) => {
  const expiresAt = plan.expiresAt ? new Date(plan.expiresAt) : undefined;
  const certificateLimit = Number(plan.certificateLimit ?? 5);
  return {
    name: String(plan.name || "trial").toLowerCase(),
    status: String(plan.status || "trial").toLowerCase(),
    certificateLimit:
      Number.isFinite(certificateLimit) && certificateLimit >= 0
        ? Math.floor(certificateLimit)
        : 5,
    expiresAt:
      expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : undefined,
  };
};

const countIssuedCertificates = async (adminId) =>
  Certificate.distinct("certificateId", {
    issuedByAdminId: adminId,
    chainStatus: { $ne: "failed" },
  }).then((ids) => ids.length);

const getPlanSnapshot = async (admin) => {
  const plan = normalizePlan(admin.plan || {});
  const issuedCount = await countIssuedCertificates(admin._id);
  const expired = plan.expiresAt ? plan.expiresAt.getTime() < Date.now() : false;
  const status = expired ? "expired" : plan.status;

  return {
    ...plan,
    status,
    issuedCount,
    remaining: Math.max(plan.certificateLimit - issuedCount, 0),
  };
};

const assertPlanAllowsIssue = async (admin, requestedCount) => {
  const plan = await getPlanSnapshot(admin);

  if (!planActiveStatuses.includes(plan.status)) {
    const error = new Error("Your plan is not active. Contact the super admin.");
    error.statusCode = 402;
    throw error;
  }

  if (plan.issuedCount + requestedCount > plan.certificateLimit) {
    const error = new Error(
      `Plan limit reached. ${plan.remaining} certificate(s) remaining. Contact the super admin.`
    );
    error.statusCode = 402;
    throw error;
  }

  return plan;
};

const getInstitutionVerificationSnapshot = (admin = {}) => {
  const verification = admin.institutionVerification || {};
  const branding = admin.branding || {};

  return {
    status: verification.status || "unverified",
    locked: Boolean(verification.locked),
    instituteName: branding.instituteName || "",
    institutionKey: admin.institutionKey || "",
    reviewedAt: verification.reviewedAt,
  };
};

const assertInstitutionVerified = (admin = {}) => {
  const verification = getInstitutionVerificationSnapshot(admin);
  if (verification.status !== "verified") {
    const error = new Error(
      verification.status === "suspended"
        ? "Institution issuing is suspended. Contact the super admin."
        : "Institution is not verified. Contact the super admin before issuing certificates."
    );
    error.statusCode = 403;
    throw error;
  }

  return verification;
};

const assertInstitutionVerifiedOrTrial = (admin = {}, plan = {}, requestedCount = 1) => {
  const verification = getInstitutionVerificationSnapshot(admin);
  const withinFreeTrial =
    plan.name === "trial" &&
    plan.status === "trial" &&
    plan.issuedCount + requestedCount <= 5;

  if (verification.status === "verified" || withinFreeTrial) {
    return verification;
  }

  const error = new Error(
    verification.status === "suspended"
      ? "Institution issuing is suspended. Contact the super admin."
      : "Free trial allows 5 certificates without institution verification. Verify the institution before issuing more certificates."
  );
  error.statusCode = 403;
  throw error;
};

const buildReissueChainCertificateId = (certificateId) => {
  const numericId = String(certificateId).replace(/\D/g, "") || "1";
  const normalizedId = BigInt(numericId).toString();
  const timestampSuffix = Date.now().toString().slice(-10);

  return `${normalizedId}${timestampSuffix}`;
};

const buildAdminChainCertificateId = (adminId, certificateId) => {
  const adminHex = String(adminId || "")
    .replace(/[^a-fA-F0-9]/g, "")
    .slice(-12)
    .padStart(12, "0");
  const adminPart = BigInt(`0x${adminHex}`);
  const certificatePart = BigInt(String(certificateId).replace(/\D/g, "") || "1");

  return (adminPart * 1_000_000n + certificatePart).toString();
};

const isCertificateIdExistsError = (error) =>
  String(error?.shortMessage || error?.reason || error?.message || "")
    .toLowerCase()
    .includes("already exists");

const escapeRegExp = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeComparableText = (value = "") =>
  String(value).trim().replace(/\s+/g, " ");

const normalizeInstitutionKey = (value = "") =>
  normalizeComparableText(value).toLowerCase();

const exactTextRegex = (value = "") =>
  new RegExp(`^${escapeRegExp(normalizeComparableText(value))}$`, "i");

const getDateRange = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const buildHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseCertificateDate = (value, label) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw buildHttpError(`${label} is invalid.`);
  }

  return date;
};

const normalizeCertificateDateRange = (issueDate, expiryDate) => {
  const normalizedIssueDate = parseCertificateDate(issueDate, "Issue date");
  const normalizedExpiryDate = expiryDate
    ? parseCertificateDate(expiryDate, "Expiry date")
    : undefined;

  if (
    normalizedExpiryDate &&
    normalizedExpiryDate.getTime() <= normalizedIssueDate.getTime()
  ) {
    throw buildHttpError("Expiry date must be after the issue date.");
  }

  return {
    issueDate: normalizedIssueDate,
    expiryDate: normalizedExpiryDate,
  };
};

const getAdminCertificateScope = (req) => ({
  issuedByAdminId: req.admin._id,
});

const isSuperAdmin = (req) => req.admin?.role === "super_admin";

const getCertificateAccessScope = (req) =>
  isSuperAdmin(req) ? {} : getAdminCertificateScope(req);

const getCertificateGroupKey = (req) =>
  isSuperAdmin(req)
    ? { certificateId: "$certificateId", issuedByAdminId: "$issuedByAdminId" }
    : "$certificateId";

const getAdminOwnerFields = (req) => ({
  issuedByAdminId: req.admin._id,
  issuedByEmail: req.admin.email,
});

const getAdminActivityFields = (req) => ({
  adminId: req.admin._id,
  adminEmail: req.admin.email,
});

const brandingFields = [
  "instituteName",
  "instituteWebsite",
  "instituteAddress",
  "logoDataUrl",
  "signatureDataUrl",
  "stampDataUrl",
  "certificateTitle",
  "certificateBody",
  "certificateFooter",
  "primaryColor",
  "secondaryColor",
];

const institutionIdentityBrandingFields = [
  "instituteName",
  "instituteWebsite",
  "instituteAddress",
  "logoDataUrl",
  "signatureDataUrl",
  "stampDataUrl",
];

const normalizeBranding = (branding = {}) =>
  brandingFields.reduce((acc, field) => {
    acc[field] = String(branding?.[field] || "").trim();
    return acc;
  }, {});

const removeUnverifiedInstitutionIdentity = (branding, admin = {}) => {
  if (admin.institutionVerification?.status === "verified") {
    return branding;
  }

  return institutionIdentityBrandingFields.reduce(
    (acc, field) => ({
      ...acc,
      [field]: "",
    }),
    branding
  );
};

const getBrandingSnapshot = (req, providedBranding) => {
  const adminBranding =
    typeof req.admin.branding?.toObject === "function"
      ? req.admin.branding.toObject()
      : req.admin.branding || {};
  return removeUnverifiedInstitutionIdentity(
    normalizeBranding({ ...adminBranding, ...(providedBranding || {}) }),
    req.admin
  );
};

const buildDuplicateCertificateQuery = (req, payload = {}) => {
  const studentName = normalizeComparableText(payload.studentName);
  const courseName = normalizeComparableText(payload.courseName);
  const dateRange = getDateRange(payload.issueDate);
  const branding = getBrandingSnapshot(req, payload.branding || {});
  const instituteName = normalizeComparableText(
    payload.instituteName || branding.instituteName || ""
  );
  const institutionKey =
    normalizeInstitutionKey(payload.institutionKey) ||
    normalizeInstitutionKey(instituteName);

  if (!studentName || !courseName || !dateRange) {
    return null;
  }

  const query = {
    studentName: exactTextRegex(studentName),
    courseName: exactTextRegex(courseName),
    issueDate: { $gte: dateRange.start, $lte: dateRange.end },
    chainStatus: { $ne: "failed" },
  };

  if (institutionKey || instituteName) {
    query.$or = [
      { "institutionVerificationSnapshot.institutionKey": institutionKey },
      { "brandingSnapshot.instituteName": exactTextRegex(instituteName || institutionKey) },
    ];
  } else {
    Object.assign(query, getAdminCertificateScope(req));
  }

  return query;
};

const summarizeDuplicateCertificate = (certificate) => ({
  certificateId: certificate.certificateId,
  studentName: certificate.studentName,
  courseName: certificate.courseName,
  issueDate: certificate.issueDate,
  instituteName:
    certificate.brandingSnapshot?.instituteName ||
    certificate.institutionVerificationSnapshot?.instituteName ||
    "",
  issuedBy: certificate.issuedBy || "Admin",
  issuedByEmail: certificate.issuedByEmail || "",
  revoked: Boolean(certificate.revoked),
  chainStatus: certificate.chainStatus || "confirmed",
  createdAt: certificate.createdAt,
});

const findPotentialDuplicateCertificates = async (req, payload = {}) => {
  const query = buildDuplicateCertificateQuery(req, payload);
  if (!query) return [];

  return Certificate.find(query)
    .sort({ createdAt: -1 })
    .limit(5)
    .select(
      "certificateId studentName courseName issueDate issuedBy issuedByEmail brandingSnapshot institutionVerificationSnapshot revoked chainStatus createdAt"
    )
    .then((certificates) => certificates.map(summarizeDuplicateCertificate));
};

const unownedRecordFilter = (fieldName) => ({
  $or: [{ [fieldName]: { $exists: false } }, { [fieldName]: null }],
});

const assignLegacyRecordsToOriginalAdmin = async (req) => {
  if (req.admin?.role !== "admin") {
    return;
  }

  const originalAdmin = await Admin.findOne()
    .sort({ createdAt: 1, _id: 1 })
    .select("_id name email");

  if (!originalAdmin || String(originalAdmin._id) !== String(req.admin._id)) {
    return;
  }

  await Promise.all([
    Certificate.updateMany(unownedRecordFilter("issuedByAdminId"), {
      $set: {
        issuedByAdminId: originalAdmin._id,
        issuedByEmail: originalAdmin.email,
        issuedBy: originalAdmin.name || "Admin",
      },
    }),
    ActivityLog.updateMany(unownedRecordFilter("adminId"), {
      $set: {
        adminId: originalAdmin._id,
        adminEmail: originalAdmin.email,
        actor: originalAdmin.name || "Admin",
      },
    }),
  ]);
};

const fetchPdfBufferFromIpfs = async (ipfsPdfHash) => {
  const response = await fetch(`https://gateway.pinata.cloud/ipfs/${ipfsPdfHash}`);
  if (!response.ok) {
    throw new Error("Failed to download certificate PDF from IPFS.");
  }

  return Buffer.from(await response.arrayBuffer());
};

const createEmailPayloadFromCertificate = async (certificate, pdfBuffer) => ({
  to: certificate.studentEmail,
  studentName: certificate.studentName,
  courseName: certificate.courseName,
  certificateId: certificate.certificateId,
  issueDate: certificate.issueDate,
  expiryDate: certificate.expiryDate,
  certificateText: certificate.certificateText,
  pdfBuffer,
  pdfFileName: certificate.pdfFileName,
  ipfsPdfHash: certificate.ipfsPdfHash,
  blockchainTx: certificate.blockchainTx,
  issuedBy: certificate.issuedBy,
  issuerWalletAddress: certificate.issuerWalletAddress,
  branding: certificate.brandingSnapshot || {},
  adminId: certificate.issuedByAdminId,
  adminEmail: certificate.issuedByEmail,
});

const queueCertificateEmail = (certificateMongoId, emailPayload, action = "send") => {
  setTimeout(async () => {
    try {
      await Certificate.updateOne(
        { _id: certificateMongoId },
        { $set: { emailStatus: "queued", emailError: "" } }
      );

      const emailResult = await sendCertificateEmail(emailPayload);
      const emailStatus = emailResult.sent
        ? "sent"
        : emailResult.skipped
          ? "skipped"
          : "failed";
      const updateFields = {
        emailStatus,
        emailError: emailResult.message || "",
      };

      if (emailResult.sent) {
        updateFields.emailSentAt = new Date();
      }

      await Certificate.updateOne(
        { _id: certificateMongoId },
        {
          $set: updateFields,
          $push: {
            emailHistory: {
              status: emailStatus,
              message: emailResult.message || "",
              sentAt: new Date(),
              action,
            },
          },
        }
      );

      await logActivity({
        action: action === "resend" ? "email_resent" : "email_sent",
        certificateId: emailPayload.certificateId,
        studentEmail: emailPayload.to,
        adminId: emailPayload.adminId,
        adminEmail: emailPayload.adminEmail,
        actor: emailPayload.actor || "System",
        message:
          emailStatus === "sent"
            ? `Certificate email ${action === "resend" ? "resent" : "sent"} successfully.`
            : `Certificate email ${emailStatus}.`,
        details: { emailStatus },
      });
    } catch (emailError) {
      console.error("Certificate email error:", emailError);
      await Certificate.updateOne(
        { _id: certificateMongoId },
        {
          $set: {
            emailStatus: "failed",
            emailError: "Certificate email could not be sent.",
          },
          $push: {
            emailHistory: {
              status: "failed",
              message: "Certificate email could not be sent.",
              sentAt: new Date(),
              action,
            },
          },
        }
      );

      await logActivity({
        action: action === "resend" ? "email_resend_failed" : "email_failed",
        certificateId: emailPayload.certificateId,
        studentEmail: emailPayload.to,
        adminId: emailPayload.adminId,
        adminEmail: emailPayload.adminEmail,
        actor: emailPayload.actor || "System",
        message: "Certificate email could not be sent.",
      });
    }
  }, 0);
};

const queueChainConfirmation = (certificateMongoId, txHash, emailPayload) => {
  setTimeout(async () => {
    try {
      const result = await waitForTransactionReceipt(txHash);

      if (result.confirmed) {
        await Certificate.updateOne(
          { _id: certificateMongoId },
          {
            $set: {
              chainStatus: "confirmed",
              chainConfirmedAt: new Date(),
              chainError: "",
            },
          }
        );
        await logActivity({
          action: "chain_confirmed",
          certificateId: emailPayload.certificateId,
          studentEmail: emailPayload.to,
          adminId: emailPayload.adminId,
          adminEmail: emailPayload.adminEmail,
          actor: "System",
          message: "Blockchain transaction confirmed.",
          details: { blockchainTx: txHash },
        });
        if (emailPayload.sendEmail !== false) {
          queueCertificateEmail(certificateMongoId, emailPayload);
        }
        return;
      }

      await Certificate.updateOne(
        { _id: certificateMongoId },
        {
          $set: {
            chainStatus: "failed",
            chainError: result.timedOut
              ? "Transaction confirmation timed out."
              : "Blockchain transaction failed.",
            ...(emailPayload.sendEmail === false
              ? {}
              : {
                  emailStatus: "failed",
                  emailError:
                    "Certificate email was not sent because the chain transaction failed.",
                }),
          },
        }
      );
      await logActivity({
        action: "chain_failed",
        certificateId: emailPayload.certificateId,
        studentEmail: emailPayload.to,
        adminId: emailPayload.adminId,
        adminEmail: emailPayload.adminEmail,
        actor: "System",
        message: result.timedOut
          ? "Blockchain transaction confirmation timed out."
          : "Blockchain transaction failed.",
        details: { blockchainTx: txHash },
      });
    } catch (error) {
      console.error("Chain confirmation monitor error:", error);
      await Certificate.updateOne(
        { _id: certificateMongoId },
        {
          $set: {
            chainStatus: "failed",
            chainError: "Blockchain confirmation could not be completed.",
            ...(emailPayload.sendEmail === false
              ? {}
              : {
                  emailStatus: "failed",
                  emailError:
                    "Certificate email was not sent because chain confirmation failed.",
                }),
          },
        }
      );
      await logActivity({
        action: "chain_monitor_failed",
        certificateId: emailPayload.certificateId,
        studentEmail: emailPayload.to,
        adminId: emailPayload.adminId,
        adminEmail: emailPayload.adminEmail,
        actor: "System",
        message: "Blockchain confirmation could not be completed.",
        details: { blockchainTx: txHash },
      });
    }
  }, 0);
};

router.post("/duplicates/check", protect, adminOnly, async (req, res) => {
  try {
    const duplicates = await findPotentialDuplicateCertificates(req, req.body || {});

    res.json({
      success: true,
      hasDuplicates: duplicates.length > 0,
      duplicates,
      message:
        duplicates.length > 0
          ? "A similar certificate already exists for this institution."
          : "No similar certificate found.",
    });
  } catch (error) {
    console.error("Duplicate certificate check error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check duplicate certificates.",
    });
  }
});

//Issue a new certificate
 
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const {
      certificateId,
      studentName,
      studentEmail,
      courseName,
      issueDate,
      expiryDate,
      template,
      ipfsPdfHash,
      blockchainTx,
      fileHash,
      metadataCid,
      issuedBy,
      issuerWalletAddress,
      pdfFileName,
      pdfBase64,
      chainStatus,
      chainCertificateId,
      sendEmail = true,
      includePublicVerifyLink = false,
      certificateText,
      branding,
      allowDuplicate = false,
    } = req.body;

    // Validate required fields
    if (
      !certificateId ||
      !studentName ||
      !studentEmail ||
      !courseName ||
      !issueDate ||
      !ipfsPdfHash ||
      !pdfBase64
    ) {
      return res.status(400).json({
        success: false,
        message:
          "All certificate fields, student email, and PDF attachment are required.",
      });
    }

    if (!blockchainTx && (!fileHash || !metadataCid)) {
      return res.status(400).json({
        success: false,
        message: "Certificate file hash and metadata CID are required for platform issuing.",
      });
    }

    if (!isValidEmail(studentEmail)) {
      return res.status(400).json({
        success: false,
        message: "A valid student email is required.",
      });
    }

    // Check for duplicate live records before saving.
    const duplicateFilters = [{ certificateId, ...getAdminCertificateScope(req) }];
    if (blockchainTx) duplicateFilters.push({ blockchainTx });
    const existingCert = await Certificate.findOne({ $or: duplicateFilters });
    if (existingCert) {
      return res.status(409).json({
        success: false,
        message:
          existingCert.certificateId === certificateId
            ? `Certificate ID "${certificateId}" already exists.`
            : "This blockchain transaction is already saved.",
      });
    }

    const {
      issueDate: normalizedIssueDate,
      expiryDate: normalizedExpiryDate,
    } = normalizeCertificateDateRange(issueDate, expiryDate);

    const potentialDuplicates = await findPotentialDuplicateCertificates(req, {
      studentName,
      courseName,
      issueDate: normalizedIssueDate,
      branding,
    });
    if (potentialDuplicates.length > 0 && allowDuplicate !== true) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_CERTIFICATE_WARNING",
        message:
          "A similar certificate already exists for this institution. Confirm before issuing another one.",
        duplicates: potentialDuplicates,
      });
    }

    const plan = await assertPlanAllowsIssue(req.admin, 1);
    const institutionVerificationSnapshot = assertInstitutionVerifiedOrTrial(
      req.admin,
      plan,
      1
    );

    const finalChainCertificateId =
      chainCertificateId || buildAdminChainCertificateId(req.admin._id, certificateId);
    const platformTx = blockchainTx
      ? null
      : await issueCertificateWithPlatformWallet({
          certificateId: finalChainCertificateId,
          fileHash,
          metadataCid,
        });
    const finalBlockchainTx = blockchainTx || platformTx.hash;
    const platformIssuerWalletAddress = platformTx?.platformWalletAddress || "";
    const platformRecipientWalletAddress = platformTx?.recipientWalletAddress || "";
    const shouldConfirmInBackground = chainStatus === "pending" || !blockchainTx;
    const shouldSendEmail = sendEmail !== false;
    const shouldIncludePublicVerifyLink = includePublicVerifyLink === true;
    const brandingSnapshot = getBrandingSnapshot(req, branding);

    // Save certificate
    const newCertificate = await Certificate.create({
      certificateId,
      chainCertificateId: finalChainCertificateId,
      studentName,
      studentEmail,
      courseName,
      issueDate: normalizedIssueDate,
      expiryDate: normalizedExpiryDate,
      template: normalizeCertificateTemplate(template),
      ipfsPdfHash,
      metadataCid,
      blockchainTx: finalBlockchainTx,
      chainStatus: shouldConfirmInBackground ? "pending" : "confirmed",
      chainConfirmedAt: shouldConfirmInBackground ? undefined : new Date(),
      issuedBy: issuedBy || req.admin?.name || "Unknown Admin",
      ...getAdminOwnerFields(req),
      issuerWalletAddress:
        platformIssuerWalletAddress ||
        issuerWalletAddress ||
        req.admin?.walletAddress ||
        "",
      pdfFileName,
      certificateText: certificateText || brandingSnapshot.certificateBody || "",
      brandingSnapshot,
      institutionVerificationSnapshot,
      emailStatus: shouldSendEmail
        ? shouldConfirmInBackground
          ? "waiting_chain"
          : "queued"
        : "skipped",
    });

    console.log(`New certificate issued: ${certificateId}`);

    const emailPayload = {
      to: studentEmail,
      studentName,
      courseName,
      certificateId,
      issueDate: normalizedIssueDate,
      expiryDate: normalizedExpiryDate,
      certificateText: newCertificate.certificateText,
      pdfBase64,
      pdfFileName,
      ipfsPdfHash,
      blockchainTx: finalBlockchainTx,
      issuedBy: newCertificate.issuedBy,
      issuerWalletAddress: newCertificate.issuerWalletAddress,
      branding: newCertificate.brandingSnapshot,
      adminId: req.admin._id,
      adminEmail: req.admin.email,
      sendEmail: shouldSendEmail,
      includePublicVerifyLink: shouldIncludePublicVerifyLink,
      actor: req.admin?.name || "Admin",
    };

    if (shouldConfirmInBackground) {
      queueChainConfirmation(newCertificate._id, finalBlockchainTx, emailPayload);
    } else if (shouldSendEmail) {
      queueCertificateEmail(newCertificate._id, emailPayload);
    }

    await logActivity({
      action: "certificate_issued",
      certificateId,
      studentEmail,
      ...getAdminActivityFields(req),
      actor: req.admin?.name || "Admin",
      message: shouldConfirmInBackground
        ? "Certificate saved with pending blockchain confirmation."
        : "Certificate issued.",
      details: {
        blockchainTx: finalBlockchainTx,
        issuerWalletAddress: newCertificate.issuerWalletAddress,
        recipientWalletAddress: platformRecipientWalletAddress,
        metadataCid,
        chainStatus: newCertificate.chainStatus,
        emailStatus: newCertificate.emailStatus,
        template: newCertificate.template,
        expiryDate: newCertificate.expiryDate,
      },
    });

    res.status(201).json({
      success: true,
      message: shouldSendEmail
        ? shouldConfirmInBackground
          ? "Certificate saved. Blockchain confirmation and email are running in the background."
          : "Certificate issued successfully. Email is queued."
        : "Certificate issued successfully. Email delivery is turned off in settings.",
      email: {
        sent: false,
        queued: shouldSendEmail,
        status: newCertificate.emailStatus,
        message: shouldSendEmail
          ? shouldConfirmInBackground
            ? "Email will be sent after blockchain confirmation."
            : "Certificate email is queued."
          : "Email delivery is turned off in settings.",
      },
      certificate: {
        id: newCertificate._id,
        certificateId: newCertificate.certificateId,
        chainCertificateId: newCertificate.chainCertificateId,
        studentName: newCertificate.studentName,
        studentEmail: newCertificate.studentEmail,
        courseName: newCertificate.courseName,
        issueDate: newCertificate.issueDate,
        expiryDate: newCertificate.expiryDate,
        template: newCertificate.template,
        ipfsPdfHash: newCertificate.ipfsPdfHash,
        metadataCid: newCertificate.metadataCid,
        blockchainTx: newCertificate.blockchainTx,
        chainStatus: newCertificate.chainStatus,
        pdfFileName: newCertificate.pdfFileName,
        certificateText: newCertificate.certificateText,
        brandingSnapshot: newCertificate.brandingSnapshot,
        issuerWalletAddress: newCertificate.issuerWalletAddress,
        issuedBy: newCertificate.issuedBy,
        emailStatus: newCertificate.emailStatus,
        revoked: newCertificate.revoked,
        createdAt: newCertificate.createdAt,
      },
    });
  } catch (error) {
    console.error("Certificate issue error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate certificate data already exists.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Could not issue the certificate. Please try again.",
    });
  }
});


router.get("/next-id", protect, adminOnly, async (req, res) => {
  try {
    await assignLegacyRecordsToOriginalAdmin(req);

    const latest = await Certificate.aggregate([
      { $match: getAdminCertificateScope(req) },
      {
        $project: {
          certNumber: {
            $convert: {
              input: "$certificateId",
              to: "int",
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
      { $sort: { certNumber: -1 } },
      { $limit: 1 },
    ]);

    const nextNumber = (latest[0]?.certNumber || 0) + 1;
    const certificateId = String(nextNumber).padStart(4, "0");

    res.status(200).json({
      success: true,
      certificateId,
    });
  } catch (error) {
    console.error("Generate next certificate ID error:", error);
    res.status(500).json({
      success: false,
      message: "Could not prepare the next certificate ID. Please try again.",
    });
  }
});

router.post("/batch", protect, adminOnly, async (req, res) => {
  try {
    const {
      certificates,
      sendEmail = true,
      includePublicVerifyLink = false,
      allowDuplicate = false,
    } = req.body;

    if (!Array.isArray(certificates) || certificates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one certificate is required for batch issue.",
      });
    }

    if (certificates.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Batch issue supports up to 50 certificates at a time.",
      });
    }

    const ids = certificates.map((cert) => cert.certificateId);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      return res.status(409).json({
        success: false,
        message: "CSV contains duplicate certificate IDs.",
      });
    }

    for (const cert of certificates) {
      if (
        !cert.certificateId ||
        !cert.studentName ||
        !cert.studentEmail ||
        !cert.courseName ||
        !cert.issueDate ||
        !cert.ipfsPdfHash ||
        !cert.pdfBase64
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Every certificate needs ID, student details, IPFS PDF, blockchain transaction, and PDF attachment.",
        });
      }

      if (!cert.blockchainTx && (!cert.fileHash || !cert.metadataCid)) {
        return res.status(400).json({
          success: false,
          message: `Certificate ${cert.certificateId} needs file hash and metadata CID for platform issuing.`,
        });
      }

      if (!isValidEmail(cert.studentEmail)) {
        return res.status(400).json({
          success: false,
          message: `Invalid student email for certificate ${cert.certificateId}.`,
        });
      }

      const normalizedDates = normalizeCertificateDateRange(
        cert.issueDate,
        cert.expiryDate
      );
      cert.issueDate = normalizedDates.issueDate;
      cert.expiryDate = normalizedDates.expiryDate;
    }

    const existingIds = await Certificate.find({
      certificateId: { $in: ids },
      ...getAdminCertificateScope(req),
    }).select("certificateId");

    if (existingIds.length) {
      return res.status(409).json({
        success: false,
        message: `Certificate ID "${existingIds[0].certificateId}" already exists.`,
      });
    }

    if (allowDuplicate !== true) {
      const duplicateGroups = [];
      for (const cert of certificates) {
        const duplicates = await findPotentialDuplicateCertificates(req, cert);
        if (duplicates.length > 0) {
          duplicateGroups.push({
            requestedCertificateId: cert.certificateId,
            studentName: cert.studentName,
            courseName: cert.courseName,
            issueDate: cert.issueDate,
            duplicates,
          });
        }
      }

      if (duplicateGroups.length > 0) {
        return res.status(409).json({
          success: false,
          code: "DUPLICATE_CERTIFICATE_WARNING",
          message:
            "One or more similar certificates already exist for this institution. Confirm before issuing duplicates.",
          duplicateGroups,
        });
      }
    }

    const plan = await assertPlanAllowsIssue(req.admin, certificates.length);
    const institutionVerificationSnapshot = assertInstitutionVerifiedOrTrial(
      req.admin,
      plan,
      certificates.length
    );

    const certificatesWithChainIds = certificates.map((certificate) => ({
      ...certificate,
      chainCertificateId:
        certificate.chainCertificateId ||
        buildAdminChainCertificateId(req.admin._id, certificate.certificateId),
    }));
    const sharedBlockchainTx = certificates[0].blockchainTx || "";
    const hasClientBlockchainTx =
      Boolean(sharedBlockchainTx) &&
      certificates.every((cert) => cert.blockchainTx === sharedBlockchainTx);
    const platformTx = hasClientBlockchainTx
      ? null
      : await issueCertificatesWithPlatformWallet(
          certificatesWithChainIds.map((certificate) => ({
            certificateId: certificate.chainCertificateId,
            fileHash: certificate.fileHash,
            metadataCid: certificate.metadataCid,
          }))
        );
    const finalBlockchainTx = hasClientBlockchainTx ? sharedBlockchainTx : platformTx.hash;
    const platformIssuerWalletAddress = platformTx?.platformWalletAddress || "";
    const platformRecipientWalletAddress = platformTx?.recipientWalletAddress || "";
    const shouldConfirmInBackground =
      certificates.some((cert) => cert.chainStatus === "pending") || !hasClientBlockchainTx;
    const shouldSendEmail = sendEmail !== false;
    const shouldIncludePublicVerifyLink = includePublicVerifyLink === true;
    const createdCertificates = await Certificate.insertMany(
      certificatesWithChainIds.map((cert) => {
        const brandingSnapshot = getBrandingSnapshot(req, cert.branding);
        return {
          certificateId: cert.certificateId,
          chainCertificateId: cert.chainCertificateId,
          studentName: cert.studentName,
          studentEmail: cert.studentEmail,
          courseName: cert.courseName,
          issueDate: cert.issueDate,
          expiryDate: cert.expiryDate ? new Date(cert.expiryDate) : undefined,
          template: normalizeCertificateTemplate(cert.template),
          ipfsPdfHash: cert.ipfsPdfHash,
          metadataCid: cert.metadataCid,
          blockchainTx: finalBlockchainTx,
          chainStatus: shouldConfirmInBackground ? "pending" : "confirmed",
          chainConfirmedAt: shouldConfirmInBackground ? undefined : new Date(),
          issuedBy: cert.issuedBy || req.admin?.name || "Unknown Admin",
          ...getAdminOwnerFields(req),
          issuerWalletAddress:
            platformIssuerWalletAddress ||
            cert.issuerWalletAddress ||
            req.admin?.walletAddress ||
            "",
          pdfFileName: cert.pdfFileName,
          certificateText: cert.certificateText || brandingSnapshot.certificateBody || "",
          brandingSnapshot,
          institutionVerificationSnapshot,
          emailStatus: shouldSendEmail
            ? shouldConfirmInBackground
              ? "waiting_chain"
              : "queued"
            : "skipped",
        };
      })
    );

    createdCertificates.forEach((certificate, index) => {
      const source = certificatesWithChainIds[index];
      const emailPayload = {
        to: source.studentEmail,
        studentName: source.studentName,
        courseName: source.courseName,
        certificateId: source.certificateId,
        issueDate: source.issueDate,
        expiryDate: source.expiryDate,
        certificateText: certificate.certificateText,
        pdfBase64: source.pdfBase64,
        pdfFileName: source.pdfFileName,
        ipfsPdfHash: source.ipfsPdfHash,
        blockchainTx: finalBlockchainTx,
        issuedBy: certificate.issuedBy,
        issuerWalletAddress: certificate.issuerWalletAddress,
        branding: certificate.brandingSnapshot,
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        sendEmail: shouldSendEmail,
        includePublicVerifyLink: shouldIncludePublicVerifyLink,
        actor: req.admin?.name || "Admin",
      };

      if (shouldConfirmInBackground) {
        queueChainConfirmation(certificate._id, finalBlockchainTx, emailPayload);
      } else if (shouldSendEmail) {
        queueCertificateEmail(certificate._id, emailPayload);
      }
    });

    await logActivity({
      action: "certificate_batch_issued",
      ...getAdminActivityFields(req),
      actor: req.admin?.name || "Admin",
      message: `${createdCertificates.length} certificates saved from one batch transaction.`,
      details: {
        count: createdCertificates.length,
        blockchainTx: finalBlockchainTx,
        issuerWalletAddress: platformIssuerWalletAddress || req.admin?.walletAddress || "",
        recipientWalletAddress: platformRecipientWalletAddress,
        chainStatus: shouldConfirmInBackground ? "pending" : "confirmed",
      },
    });

    res.status(201).json({
      success: true,
      message: shouldSendEmail
        ? `${createdCertificates.length} certificates saved. Email will send after blockchain confirmation.`
        : `${createdCertificates.length} certificates saved. Email delivery is turned off in settings.`,
      count: createdCertificates.length,
      email: {
        sent: false,
        queued: shouldSendEmail,
        status: shouldSendEmail
          ? shouldConfirmInBackground
            ? "waiting_chain"
            : "queued"
          : "skipped",
      },
      certificates: createdCertificates.map((certificate) => ({
        id: certificate._id,
        certificateId: certificate.certificateId,
        chainCertificateId: certificate.chainCertificateId,
        studentName: certificate.studentName,
        studentEmail: certificate.studentEmail,
        courseName: certificate.courseName,
        issueDate: certificate.issueDate,
        expiryDate: certificate.expiryDate,
        ipfsPdfHash: certificate.ipfsPdfHash,
        metadataCid: certificate.metadataCid,
        blockchainTx: certificate.blockchainTx,
        chainStatus: certificate.chainStatus,
      })),
    });
  } catch (error) {
    console.error("Batch certificate issue error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate certificate data already exists.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Could not save the batch certificates. Please try again.",
    });
  }
});


 // Get last 10 issued certificates 
 
router.get("/recent", protect, async (req, res) => {
  try {
    await assignLegacyRecordsToOriginalAdmin(req);
    const accessScope = getCertificateAccessScope(req);
    const groupKey = getCertificateGroupKey(req);

    const recentCertificates = await Certificate.aggregate([
      { $match: accessScope },
      { $sort: { createdAt: -1 } },
      { $group: { _id: groupKey, certificate: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$certificate" } },
      { $sort: { createdAt: -1 } },
      { $limit: 10 },
      { $project: { __v: 0 } },
    ]);

    res.status(200).json({
      success: true,
      count: recentCertificates.length,
      certificates: recentCertificates,
    });
  } catch (error) {
    console.error("Fetch recent certificates error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load recent certificates. Please try again.",
    });
  }
});

router.get("/stats", protect, async (req, res) => {
  try {
    await assignLegacyRecordsToOriginalAdmin(req);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const analyticsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const adminScope = getCertificateAccessScope(req);
    const groupKey = getCertificateGroupKey(req);
    const countUniqueCertificates = (match = {}) =>
      Certificate.aggregate([
        { $match: match },
        { $group: { _id: groupKey } },
        { $count: "count" },
      ]).then((result) => result[0]?.count || 0);

    const [
      total,
      active,
      revoked,
      expired,
      thisMonth,
      latest,
      courseStats,
      courseBreakdown,
      emailStats,
      monthlyIssued,
      revokedTrend,
    ] = await Promise.all([
      countUniqueCertificates(adminScope),
      countUniqueCertificates({
        ...adminScope,
        revoked: { $ne: true },
        $or: [
          { expiryDate: { $exists: false } },
          { expiryDate: null },
          { expiryDate: { $gte: now } },
        ],
      }),
      countUniqueCertificates({
        ...adminScope,
        revoked: true,
      }),
      countUniqueCertificates({
        ...adminScope,
        revoked: { $ne: true },
        expiryDate: { $lt: now },
      }),
      countUniqueCertificates({
        ...adminScope,
        createdAt: { $gte: monthStart },
      }),
      Certificate.findOne(adminScope).sort({ createdAt: -1 }).select("-__v"),
      Certificate.aggregate([
        { $match: adminScope },
        { $sort: { createdAt: -1 } },
        { $group: { _id: groupKey, certificate: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$certificate" } },
        { $group: { _id: "$courseName", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 1 },
      ]),
      Certificate.aggregate([
        { $match: adminScope },
        { $sort: { createdAt: -1 } },
        { $group: { _id: groupKey, certificate: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$certificate" } },
        { $group: { _id: "$courseName", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 6 },
      ]),
      Certificate.aggregate([
        { $match: adminScope },
        { $sort: { createdAt: -1 } },
        { $group: { _id: groupKey, certificate: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$certificate" } },
        { $group: { _id: { $ifNull: ["$emailStatus", "not_started"] }, count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
      Certificate.aggregate([
        { $match: { ...adminScope, createdAt: { $gte: analyticsStart } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: groupKey, certificate: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$certificate" } },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
      Certificate.aggregate([
        {
          $match: {
            ...adminScope,
            revoked: true,
            revokedAt: { $gte: analyticsStart },
          },
        },
        {
          $group: {
            _id: { year: { $year: "$revokedAt" }, month: { $month: "$revokedAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        total,
        active,
        revoked,
        expired,
        thisMonth,
        mostIssuedCourse: courseStats[0]?._id || "None",
        mostIssuedCourseCount: courseStats[0]?.count || 0,
        courseBreakdown: courseBreakdown.map((item) => ({
          courseName: item._id || "Unknown",
          count: item.count,
        })),
        emailStats: emailStats.map((item) => ({
          status: item._id || "not_started",
          count: item.count,
        })),
        monthlyIssued: monthlyIssued.map((item) => ({
          year: item._id.year,
          month: item._id.month,
          count: item.count,
        })),
        revokedTrend: revokedTrend.map((item) => ({
          year: item._id.year,
          month: item._id.month,
          count: item.count,
        })),
        lastIssuedCertificate: latest
          ? {
              certificateId: latest.certificateId,
              studentName: latest.studentName,
              studentEmail: latest.studentEmail,
              courseName: latest.courseName,
              issueDate: latest.issueDate,
              template: latest.template,
              chainStatus: latest.chainStatus,
              emailStatus: latest.emailStatus,
              revoked: latest.revoked,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Fetch certificate stats error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load certificate analytics. Please try again.",
    });
  }
});

router.get("/all", protect, async (req, res) => {
  try {
    await assignLegacyRecordsToOriginalAdmin(req);

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filters = [getCertificateAccessScope(req)];
    const groupKey = getCertificateGroupKey(req);

    if (req.query.search) {
      filters.push({
        $or: [
          { studentName: { $regex: req.query.search, $options: "i" } },
          { studentEmail: { $regex: req.query.search, $options: "i" } },
          { courseName: { $regex: req.query.search, $options: "i" } },
          { certificateId: { $regex: req.query.search, $options: "i" } },
        ],
      });
    }

    if (req.query.course) {
      filters.push({
        courseName: { $regex: req.query.course, $options: "i" },
      });
    }

    if (req.query.status === "active") {
      filters.push({
        revoked: { $ne: true },
        $or: [
          { expiryDate: { $exists: false } },
          { expiryDate: null },
          { expiryDate: { $gte: new Date() } },
        ],
      });
    } else if (req.query.status === "revoked") {
      filters.push({ revoked: true });
    } else if (req.query.status === "expired") {
      filters.push({ revoked: { $ne: true }, expiryDate: { $lt: new Date() } });
    }

    const dateQuery = {};
    if (req.query.from) {
      dateQuery.$gte = new Date(req.query.from);
    }
    if (req.query.to) {
      const toDate = new Date(req.query.to);
      toDate.setHours(23, 59, 59, 999);
      dateQuery.$lte = toDate;
    }
    if (Object.keys(dateQuery).length) {
      filters.push({ issueDate: dateQuery });
    }

    const searchQuery = filters.length
      ? {
          $and: filters,
        }
      : {};

    const uniquePipeline = [
      { $match: searchQuery },
      { $sort: { createdAt: -1 } },
      { $group: { _id: groupKey, certificate: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$certificate" } },
      { $sort: { createdAt: -1 } },
    ];

    const [certificates, totalResult] = await Promise.all([
      Certificate.aggregate([
        ...uniquePipeline,
        { $skip: skip },
        { $limit: limit },
        { $project: { __v: 0 } },
      ]),
      Certificate.aggregate([...uniquePipeline, { $count: "total" }]),
    ]);

    const total = totalResult[0]?.total || 0;

    const formatted = certificates.map((cert) => ({
      certificateId: cert.certificateId,
      chainCertificateId: cert.chainCertificateId || cert.certificateId,
      studentName: cert.studentName,
      studentEmail: cert.studentEmail || "",
      courseName: cert.courseName,
      issueDate: new Date(cert.issueDate).toISOString().split("T")[0],
      expiryDate: cert.expiryDate
        ? new Date(cert.expiryDate).toISOString().split("T")[0]
        : "",
      template: normalizeCertificateTemplate(cert.template),
      issuedBy: cert.issuedBy || "Admin",
      issuerWalletAddress: cert.issuerWalletAddress || "",
      ipfsPdfHash: cert.ipfsPdfHash,
      metadataCid: cert.metadataCid,
      blockchainTx: cert.blockchainTx,
      chainStatus: cert.chainStatus || "confirmed",
      chainError: cert.chainError || "",
      pdfFileName: cert.pdfFileName,
      emailStatus: cert.emailStatus || "not_started",
      emailSentAt: cert.emailSentAt,
      emailError: cert.emailError || "",
      emailHistory: cert.emailHistory || [],
      editedAt: cert.editedAt,
      editedBy: cert.editedBy,
      editNote: cert.editNote || "",
      certificateText: cert.certificateText || "",
      brandingSnapshot: cert.brandingSnapshot || {},
      revoked: Boolean(cert.revoked),
      revokedAt: cert.revokedAt,
      revokedBy: cert.revokedBy,
      revokeTx: cert.revokeTx,
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
      message: "Could not load certificates. Please try again.",
    });
  }
});

router.get("/activity/logs", protect, async (req, res) => {
  try {
    await assignLegacyRecordsToOriginalAdmin(req);

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const skip = (page - 1) * limit;
    const dateQuery = {};

    if (req.query.from) {
      dateQuery.$gte = new Date(req.query.from);
    }

    if (req.query.to) {
      const toDate = new Date(req.query.to);
      toDate.setHours(23, 59, 59, 999);
      dateQuery.$lte = toDate;
    }

    const filter = isSuperAdmin(req) ? {} : { adminId: req.admin._id };
    if (Object.keys(dateQuery).length) {
      filter.createdAt = dateQuery;
    }
    if (req.query.search) {
      const search = String(req.query.search).trim();
      filter.$or = [
        { action: { $regex: search, $options: "i" } },
        { certificateId: { $regex: search, $options: "i" } },
        { studentEmail: { $regex: search, $options: "i" } },
        { actor: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
        { "details.blockchainTx": { $regex: search, $options: "i" } },
        { "details.revokeTx": { $regex: search, $options: "i" } },
        { "details.issuerWalletAddress": { $regex: search, $options: "i" } },
      ];
    }

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-__v"),
      ActivityLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      logs,
      total,
      page,
      limit,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (error) {
    console.error("Fetch activity logs error:", error);
    res.status(500).json({
      success: false,
      message: "Could not load activity logs. Please try again.",
    });
  }
});

router.post("/:certificateId/resend-email", protect, adminOnly, async (req, res) => {
  try {
    await assignLegacyRecordsToOriginalAdmin(req);

    const { certificateId } = req.params;
    const certificate = await Certificate.findOne({
      certificateId,
      ...getAdminCertificateScope(req),
    });

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found.",
      });
    }

    if (!certificate.studentEmail) {
      return res.status(400).json({
        success: false,
        message: "Student email is missing for this certificate.",
      });
    }

    if (certificate.revoked) {
      return res.status(409).json({
        success: false,
        message: "Cannot resend email for a revoked certificate.",
      });
    }

    if (certificate.chainStatus === "pending") {
      return res.status(409).json({
        success: false,
        message: "Certificate is still pending blockchain confirmation.",
      });
    }

    if (certificate.chainStatus === "failed") {
      return res.status(409).json({
        success: false,
        message: "Cannot resend email because blockchain confirmation failed.",
      });
    }

    const pdfBuffer = await fetchPdfBufferFromIpfs(certificate.ipfsPdfHash);
    const emailPayload = await createEmailPayloadFromCertificate(certificate, pdfBuffer);
    emailPayload.includePublicVerifyLink = req.body.includePublicVerifyLink === true;
    emailPayload.actor = req.admin?.name || "Admin";

    queueCertificateEmail(certificate._id, emailPayload, "resend");

    await logActivity({
      action: "email_resend_queued",
      certificateId,
      studentEmail: certificate.studentEmail,
      ...getAdminActivityFields(req),
      actor: req.admin?.name || "Admin",
      message: "Certificate resend email queued.",
    });

    res.status(200).json({
      success: true,
      message: "Certificate email resend queued.",
    });
  } catch (error) {
    console.error("Resend certificate email error:", error);
    res.status(500).json({
      success: false,
      message: "Could not resend the certificate email. Please try again.",
    });
  }
});

router.post("/:certificateId/reissue", protect, adminOnly, async (req, res) => {
  try {
    await assignLegacyRecordsToOriginalAdmin(req);

    const { certificateId } = req.params;
    const {
      studentName,
      studentEmail,
      courseName,
      issueDate,
      expiryDate,
      template,
      editNote,
      ipfsPdfHash,
      blockchainTx,
      revokeTx,
      fileHash,
      pdfFileName,
      pdfBase64,
      chainStatus,
      metadataCid,
      chainCertificateId,
      certificateText,
      branding,
      issuerWalletAddress,
      sendEmail = true,
      includePublicVerifyLink = false,
    } = req.body;

    if (
      !studentName ||
      !studentEmail ||
      !courseName ||
      !issueDate ||
      !ipfsPdfHash ||
      !pdfBase64
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Student details, revoke transaction, new blockchain transaction, IPFS PDF, and PDF attachment are required.",
      });
    }

    if (!blockchainTx && (!fileHash || !metadataCid)) {
      return res.status(400).json({
        success: false,
        message: "Corrected certificate file hash and metadata CID are required.",
      });
    }

    if (!isValidEmail(studentEmail)) {
      return res.status(400).json({
        success: false,
        message: "A valid student email is required.",
      });
    }

    const {
      issueDate: normalizedIssueDate,
      expiryDate: normalizedExpiryDate,
    } = normalizeCertificateDateRange(issueDate, expiryDate);

    const certificate = await Certificate.findOne({
      certificateId,
      ...getAdminCertificateScope(req),
    });
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found.",
      });
    }

    if (blockchainTx) {
      const duplicateTx = await Certificate.findOne({
        _id: { $ne: certificate._id },
        blockchainTx,
      });

      if (duplicateTx) {
        return res.status(409).json({
          success: false,
          message: "This blockchain transaction is already saved.",
        });
      }
    }

    const plan = await getPlanSnapshot(req.admin);
    const institutionVerificationSnapshot = assertInstitutionVerifiedOrTrial(
      req.admin,
      plan,
      0
    );

    let finalRevokeTx = revokeTx || certificate.revokeTx || "";
    let finalBlockchainTx = blockchainTx || "";
    let finalChainCertificateId = chainCertificateId || certificateId;
    let platformIssuerWalletAddress = "";
    let platformRecipientWalletAddress = "";

    if (!certificate.revoked && !finalRevokeTx) {
      const platformRevokeTx = await revokeCertificateWithPlatformWallet(
        certificate.chainCertificateId || certificate.certificateId
      );
      finalRevokeTx = platformRevokeTx.hash;
      platformIssuerWalletAddress = platformRevokeTx.platformWalletAddress;
      await platformRevokeTx.wait();
      certificate.revoked = true;
      certificate.revokedAt = new Date();
      certificate.revokedBy = req.admin?.name || "Admin";
      certificate.revokeTx = finalRevokeTx;
      await certificate.save();
    }

    if (certificate.revoked && !finalRevokeTx) {
      finalRevokeTx = "already-revoked";
    }

    if (!finalBlockchainTx) {
      try {
        const platformIssueTx = await issueCertificateWithPlatformWallet({
          certificateId: finalChainCertificateId,
          fileHash,
          metadataCid,
        });
        finalBlockchainTx = platformIssueTx.hash;
        platformIssuerWalletAddress = platformIssueTx.platformWalletAddress;
        platformRecipientWalletAddress = platformIssueTx.recipientWalletAddress;
      } catch (issueError) {
        if (!isCertificateIdExistsError(issueError)) {
          throw issueError;
        }

        finalChainCertificateId = buildReissueChainCertificateId(certificateId);
        const platformIssueTx = await issueCertificateWithPlatformWallet({
          certificateId: finalChainCertificateId,
          fileHash,
          metadataCid,
        });
        finalBlockchainTx = platformIssueTx.hash;
        platformIssuerWalletAddress = platformIssueTx.platformWalletAddress;
        platformRecipientWalletAddress = platformIssueTx.recipientWalletAddress;
      }
    }

    const nextTemplate = normalizeCertificateTemplate(template);
    const shouldConfirmInBackground = chainStatus === "pending";
    const shouldSendEmail = sendEmail !== false;
    const shouldIncludePublicVerifyLink = includePublicVerifyLink === true;
    const reissuedAt = new Date();
    const reissuedBy = req.admin?.name || "Admin";
    const brandingSnapshot = getBrandingSnapshot(req, branding);
    const previous = {
      studentName: certificate.studentName,
      studentEmail: certificate.studentEmail,
      courseName: certificate.courseName,
      issueDate: certificate.issueDate,
      expiryDate: certificate.expiryDate,
      template: certificate.template,
      ipfsPdfHash: certificate.ipfsPdfHash,
      blockchainTx: certificate.blockchainTx,
      chainCertificateId: certificate.chainCertificateId || certificate.certificateId,
      revoked: certificate.revoked,
      revokedAt: certificate.revokedAt,
      revokeTx: certificate.revokeTx,
    };
    const next = {
      studentName,
      studentEmail,
      courseName,
      issueDate: normalizedIssueDate,
      expiryDate: normalizedExpiryDate,
      template: nextTemplate,
      ipfsPdfHash,
      blockchainTx: finalBlockchainTx,
      chainCertificateId: finalChainCertificateId,
      metadataCid,
      certificateText: certificateText || brandingSnapshot.certificateBody || "",
    };
    const changes = {
      studentName: { from: certificate.studentName, to: studentName },
      studentEmail: { from: certificate.studentEmail, to: studentEmail },
      courseName: { from: certificate.courseName, to: courseName },
      issueDate: { from: certificate.issueDate, to: normalizedIssueDate },
      expiryDate: {
        from: certificate.expiryDate,
        to: normalizedExpiryDate,
      },
      template: { from: certificate.template, to: nextTemplate },
      ipfsPdfHash: { from: certificate.ipfsPdfHash, to: ipfsPdfHash },
      blockchainTx: { from: certificate.blockchainTx, to: finalBlockchainTx },
      chainCertificateId: {
        from: certificate.chainCertificateId || certificate.certificateId,
        to: finalChainCertificateId,
      },
    };

    certificate.studentName = studentName;
    certificate.studentEmail = studentEmail;
    certificate.courseName = courseName;
    certificate.issueDate = normalizedIssueDate;
    certificate.expiryDate = normalizedExpiryDate;
    certificate.template = nextTemplate;
    certificate.ipfsPdfHash = ipfsPdfHash;
    certificate.metadataCid = metadataCid;
    certificate.blockchainTx = finalBlockchainTx;
    certificate.chainCertificateId = finalChainCertificateId;
    certificate.pdfFileName = pdfFileName;
    certificate.certificateText = certificateText || brandingSnapshot.certificateBody || "";
    certificate.brandingSnapshot = brandingSnapshot;
    certificate.institutionVerificationSnapshot = institutionVerificationSnapshot;
    certificate.issuerWalletAddress =
      platformIssuerWalletAddress ||
      issuerWalletAddress ||
      req.admin?.walletAddress ||
      "";
    certificate.chainStatus = shouldConfirmInBackground ? "pending" : "confirmed";
    certificate.chainConfirmedAt = shouldConfirmInBackground ? undefined : new Date();
    certificate.chainError = "";
    certificate.emailStatus = shouldSendEmail
      ? shouldConfirmInBackground
        ? "waiting_chain"
        : "queued"
      : "skipped";
    certificate.emailSentAt = undefined;
    certificate.emailError = "";
    certificate.revoked = false;
    certificate.revokedAt = undefined;
    certificate.revokedBy = undefined;
    certificate.revokeTx = undefined;
    certificate.editedAt = reissuedAt;
    certificate.editedBy = reissuedBy;
    certificate.editNote = editNote || "";
    certificate.editHistory.push({
      editedAt: reissuedAt,
      editedBy: reissuedBy,
      note: editNote || "",
      changes,
    });
    certificate.reissueHistory.push({
      reissuedAt,
      reissuedBy,
      note: editNote || "",
      revokeTx: finalRevokeTx,
      blockchainTx: finalBlockchainTx,
      previous,
      next,
    });

    await certificate.save();

    const emailPayload = {
      to: studentEmail,
      studentName,
      courseName,
      certificateId,
      issueDate: normalizedIssueDate,
      expiryDate: certificate.expiryDate,
      certificateText: certificate.certificateText,
      pdfBase64,
      pdfFileName,
      ipfsPdfHash,
      blockchainTx: finalBlockchainTx,
      issuedBy: certificate.issuedBy,
      issuerWalletAddress: certificate.issuerWalletAddress,
      branding: certificate.brandingSnapshot,
      adminId: req.admin._id,
      adminEmail: req.admin.email,
      sendEmail: shouldSendEmail,
      includePublicVerifyLink: shouldIncludePublicVerifyLink,
      actor: reissuedBy,
    };

    if (shouldConfirmInBackground) {
      queueChainConfirmation(certificate._id, finalBlockchainTx, emailPayload);
    } else if (shouldSendEmail) {
      queueCertificateEmail(certificate._id, emailPayload);
    }

    await logActivity({
      action: "certificate_reissued",
      certificateId,
      studentEmail,
      ...getAdminActivityFields(req),
      actor: reissuedBy,
      message:
        "Old certificate was revoked and a corrected certificate was issued with the same ID.",
      details: {
        revokeTx: finalRevokeTx,
        blockchainTx: finalBlockchainTx,
        issuerWalletAddress: certificate.issuerWalletAddress,
        recipientWalletAddress: platformRecipientWalletAddress,
        chainCertificateId: certificate.chainCertificateId,
        metadataCid,
        chainStatus: certificate.chainStatus,
        emailStatus: certificate.emailStatus,
        sendEmail: shouldSendEmail,
        changes,
      },
    });

    res.status(200).json({
      success: true,
      message: shouldSendEmail
        ? "Certificate reissued successfully with the same certificate ID. Email is queued after chain confirmation."
        : "Certificate reissued successfully with the same certificate ID. Email delivery is turned off in settings.",
      email: {
        sent: false,
        queued: shouldSendEmail,
        status: certificate.emailStatus,
        message: shouldSendEmail
          ? shouldConfirmInBackground
            ? "Email will be sent after blockchain confirmation."
            : "Certificate email is queued."
          : "Certificate email delivery is turned off in settings.",
      },
      certificate,
    });
  } catch (error) {
    console.error("Reissue certificate error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: "Could not reissue the certificate. Please try again.",
    });
  }
});

router.patch("/:certificateId", protect, adminOnly, async (req, res) => {
  try {
    await assignLegacyRecordsToOriginalAdmin(req);

    const { certificateId } = req.params;
    const {
      studentName,
      studentEmail,
      courseName,
      issueDate,
      expiryDate,
      template,
      editNote,
    } = req.body;

    const certificate = await Certificate.findOne({
      certificateId,
      ...getAdminCertificateScope(req),
    });
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found.",
      });
    }

    if (certificate.revoked) {
      return res.status(409).json({
        success: false,
        message: "Revoked certificates cannot be edited.",
      });
    }

    if (!studentName || !studentEmail || !courseName || !issueDate) {
      return res.status(400).json({
        success: false,
        message: "Student name, email, course, and issue date are required.",
      });
    }

    if (!isValidEmail(studentEmail)) {
      return res.status(400).json({
        success: false,
        message: "A valid student email is required.",
      });
    }

    const {
      issueDate: normalizedIssueDate,
      expiryDate: normalizedExpiryDate,
    } = normalizeCertificateDateRange(issueDate, expiryDate);

    const nextTemplate = normalizeCertificateTemplate(template);
    const changes = {
      studentName: { from: certificate.studentName, to: studentName },
      studentEmail: { from: certificate.studentEmail, to: studentEmail },
      courseName: { from: certificate.courseName, to: courseName },
      issueDate: { from: certificate.issueDate, to: normalizedIssueDate },
      expiryDate: {
        from: certificate.expiryDate,
        to: normalizedExpiryDate,
      },
      template: { from: certificate.template, to: nextTemplate },
    };

    certificate.studentName = studentName;
    certificate.studentEmail = studentEmail;
    certificate.courseName = courseName;
    certificate.issueDate = normalizedIssueDate;
    certificate.expiryDate = normalizedExpiryDate;
    certificate.template = nextTemplate;
    certificate.editedAt = new Date();
    certificate.editedBy = req.admin?.name || "Admin";
    certificate.editNote = editNote || "";
    certificate.editHistory.push({
      editedAt: new Date(),
      editedBy: req.admin?.name || "Admin",
      note: editNote || "",
      changes,
    });

    await certificate.save();

    await logActivity({
      action: "certificate_record_edited",
      certificateId,
      studentEmail,
      ...getAdminActivityFields(req),
      actor: req.admin?.name || "Admin",
      message:
        "Certificate database record edited. Existing blockchain hash/IPFS PDF were not changed.",
      details: { changes, editNote },
    });

    res.status(200).json({
      success: true,
      message:
        "Certificate record updated. Blockchain hash and existing IPFS PDF were not changed.",
      certificate,
    });
  } catch (error) {
    console.error("Edit certificate record error:", error);
    res.status(500).json({
      success: false,
      message: "Could not update the certificate record. Please try again.",
    });
  }
});

router.patch("/:certificateId/revoke", protect, adminOnly, async (req, res) => {
  try {
    await assignLegacyRecordsToOriginalAdmin(req);

    const { certificateId } = req.params;

    const certificate = await Certificate.findOne({
      certificateId,
      ...getAdminCertificateScope(req),
    });
    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found.",
      });
    }

    if (certificate.revoked) {
      return res.status(409).json({
        success: false,
        message: "Certificate is already revoked.",
      });
    }

    const platformRevokeTx = await revokeCertificateWithPlatformWallet(
      certificate.chainCertificateId || certificate.certificateId
    );
    await platformRevokeTx.wait();
    const revokeTx = platformRevokeTx.hash;

    certificate.revoked = true;
    certificate.revokedAt = new Date();
    certificate.revokedBy = req.admin?.name || "Admin";
    certificate.revokeTx = revokeTx;
    certificate.issuerWalletAddress =
      certificate.issuerWalletAddress ||
      platformRevokeTx.platformWalletAddress ||
      req.admin?.walletAddress ||
      "";

    await certificate.save();

    await logActivity({
      action: "certificate_revoked",
      certificateId,
      studentEmail: certificate.studentEmail,
      ...getAdminActivityFields(req),
      actor: req.admin?.name || "Admin",
      message: "Certificate revoked.",
      details: {
        revokeTx,
        issuerWalletAddress: platformRevokeTx.platformWalletAddress,
      },
    });

    res.status(200).json({
      success: true,
      message: "Certificate revoked successfully.",
      certificate: {
        certificateId: certificate.certificateId,
        revoked: certificate.revoked,
        revokedAt: certificate.revokedAt,
        revokedBy: certificate.revokedBy,
        revokeTx: certificate.revokeTx,
      },
    });
  } catch (error) {
    console.error("Revoke certificate error:", error);
    res.status(500).json({
      success: false,
      message: "Could not revoke the certificate. Please try again.",
    });
  }
});

export default router;

import express from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";
import Certificate from "../models/Certificate.js";
import ActivityLog from "../models/ActivityLog.js";
import AdminSignupOtp from "../models/AdminSignupOtp.js";
import { protect, superAdminOnly } from "../middleware/authMiddleware.js";
import {
  sendPasswordResetEmail,
  sendSignupOtpEmail,
} from "../utils/emailService.js";
import { logActivity } from "../utils/activityLogger.js";

const router = express.Router();

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();
const normalizeWalletAddress = (walletAddress = "") => String(walletAddress).trim();
const isValidEmail = (email = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
const isValidWalletAddress = (walletAddress = "") =>
  /^0x[a-fA-F0-9]{40}$/.test(String(walletAddress).trim());
const allowedPlanNames = ["trial", "basic", "pro", "enterprise", "custom"];
const allowedPlanStatuses = ["trial", "active", "paused", "expired"];
const defaultPlan = {
  name: "trial",
  status: "trial",
  certificateLimit: 5,
  expiresAt: undefined,
};
const upgradePlanNames = ["basic", "pro", "enterprise", "custom"];
const upgradePlanLimitPresets = {
  basic: 100,
  pro: 500,
  enterprise: 5000,
  custom: 100,
};
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
const institutionIdentityFields = [
  "instituteName",
  "instituteWebsite",
  "instituteAddress",
  "logoDataUrl",
  "signatureDataUrl",
  "stampDataUrl",
];
const allowedInstitutionDocumentTypes = [
  "registration_certificate",
  "authorization_letter",
  "other",
];
const requiredInstitutionDocumentTypes = [
  "registration_certificate",
  "authorization_letter",
];

const normalizeBranding = (branding = {}) =>
  brandingFields.reduce((acc, field) => {
    acc[field] = String(branding?.[field] || "").trim();
    return acc;
  }, {});

const normalizeInstitutionKey = (value = "") =>
  String(value).trim().toLowerCase().replace(/\s+/g, " ");

const normalizeInstitutionDocuments = (documents = []) => {
  if (!Array.isArray(documents)) return [];

  return documents
    .map((document) => ({
      type: String(document?.type || "").trim(),
      label: String(document?.label || "").trim(),
      fileName: String(document?.fileName || "").trim(),
      dataUrl: String(document?.dataUrl || "").trim(),
      uploadedAt: document?.uploadedAt ? new Date(document.uploadedAt) : new Date(),
    }))
    .filter(
      (document) =>
        allowedInstitutionDocumentTypes.includes(document.type) &&
        document.dataUrl.startsWith("data:")
    )
    .map((document) => ({
      ...document,
      uploadedAt:
        document.uploadedAt && !Number.isNaN(document.uploadedAt.getTime())
          ? document.uploadedAt
          : new Date(),
    }));
};

const hasRequiredInstitutionDocuments = (documents = []) => {
  const uploadedTypes = new Set(
    normalizeInstitutionDocuments(documents).map((document) => document.type)
  );
  return requiredInstitutionDocumentTypes.every((type) => uploadedTypes.has(type));
};

const getInstitutionDocumentTypes = (documents = []) =>
  normalizeInstitutionDocuments(documents).map((document) => document.type);

const hasInstitutionDocumentsChange = (currentDocuments = [], nextDocuments = []) =>
  JSON.stringify(normalizeInstitutionDocuments(currentDocuments)) !==
  JSON.stringify(normalizeInstitutionDocuments(nextDocuments));

const getInstitutionVerificationResponse = (admin = {}) => {
  const verification = admin.institutionVerification || {};

  return {
    status: verification.status || "unverified",
    locked: Boolean(verification.locked),
    submittedAt: verification.submittedAt,
    reviewedAt: verification.reviewedAt,
    reviewedBy: verification.reviewedBy,
    note: verification.note || "",
  };
};

const getInstitutionDocumentsResponse = (admin = {}) =>
  normalizeInstitutionDocuments(admin.institutionDocuments || []).map((document) => ({
    type: document.type,
    label: document.label || "",
    fileName: document.fileName || "",
    dataUrl: document.dataUrl || "",
    uploadedAt: document.uploadedAt,
  }));

const isInstitutionIdentityLocked = (admin) => {
  const verification = getInstitutionVerificationResponse(admin);
  return verification.locked || verification.status === "verified";
};

const hasInstitutionIdentityChange = (currentBranding = {}, nextBranding = {}) =>
  institutionIdentityFields.some(
    (field) =>
      String(currentBranding?.[field] || "").trim() !==
      String(nextBranding?.[field] || "").trim()
  );

const findVerifiedInstitutionConflict = async ({
  instituteName,
  adminId,
  adminEmail,
}) => {
  const institutionKey = normalizeInstitutionKey(instituteName);
  if (!institutionKey) return null;

  const currentAdminId = adminId ? String(adminId) : "";
  const currentAdminEmail = normalizeEmail(adminEmail);
  const verifiedMatches = await Admin.find({
    institutionKey,
    "institutionVerification.status": "verified",
  }).select("_id name email branding institutionKey institutionVerification");

  return (
    verifiedMatches.find(
      (admin) =>
        String(admin._id) !== currentAdminId &&
        normalizeEmail(admin.email) !== currentAdminEmail
    ) || null
  );
};

const isSameAdminIdentity = (candidate = {}, admin = {}, fallbackAdmin = {}) => {
  const candidateId = candidate?._id ? String(candidate._id) : "";
  const candidateEmail = normalizeEmail(candidate?.email);
  const currentIds = [admin?._id, admin?.id, fallbackAdmin?._id, fallbackAdmin?.id]
    .filter(Boolean)
    .map((id) => String(id));
  const currentEmails = [admin?.email, fallbackAdmin?.email]
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  return (
    (candidateId && currentIds.includes(candidateId)) ||
    (candidateEmail && currentEmails.includes(candidateEmail))
  );
};

const publicAdminSignupEnabled = process.env.ALLOW_PUBLIC_ADMIN_SIGNUP !== "false";

const blockPublicAdminSignup = (res) =>
  res.status(403).json({
    message: "Admin accounts are created by the super admin.",
  });

const normalizePlan = (plan = {}) => {
  const expiresAt = plan.expiresAt ? new Date(plan.expiresAt) : undefined;
  const name = allowedPlanNames.includes(String(plan.name || "").toLowerCase())
    ? String(plan.name).toLowerCase()
    : defaultPlan.name;
  const status = allowedPlanStatuses.includes(String(plan.status || "").toLowerCase())
    ? String(plan.status).toLowerCase()
    : name === "trial"
      ? "trial"
      : "active";
  const rawLimit = plan.certificateLimit;
  const parsedLimit =
    rawLimit === null || rawLimit === "" || rawLimit === undefined
      ? defaultPlan.certificateLimit
      : Number(rawLimit);

  return {
    name,
    status,
    certificateLimit:
      Number.isFinite(parsedLimit) && parsedLimit >= 0
        ? Math.floor(parsedLimit)
        : defaultPlan.certificateLimit,
    expiresAt:
      expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : undefined,
  };
};

const getIssuedCount = async (adminId) =>
  Certificate.distinct("certificateId", {
    issuedByAdminId: adminId,
    chainStatus: { $ne: "failed" },
  }).then((ids) => ids.length);

const buildPlanResponse = (admin, issuedCount = 0) => {
  const plan = normalizePlan(admin.plan || {});
  const expiresAt = plan.expiresAt;
  const expired = expiresAt ? expiresAt.getTime() < Date.now() : false;
  const effectiveStatus = expired ? "expired" : plan.status;
  const remaining = Math.max(plan.certificateLimit - issuedCount, 0);

  return {
    name: plan.name,
    status: effectiveStatus,
    certificateLimit: plan.certificateLimit,
    issuedCount,
    remaining,
    expiresAt,
  };
};

const normalizePlanUpgradeRequestResponse = (request = {}) => ({
  status: request.status || "none",
  requestedPlan: request.requestedPlan
    ? {
        name: request.requestedPlan.name || "",
        status: request.requestedPlan.status || "active",
        certificateLimit: request.requestedPlan.certificateLimit || 0,
      }
    : undefined,
  message: request.message || "",
  payment: request.payment
    ? {
        method: request.payment.method || "upi",
        upiTransactionId: request.payment.upiTransactionId || "",
        proofFileName: request.payment.proofFileName || "",
        proofDataUrl: request.payment.proofDataUrl || "",
        submittedAt: request.payment.submittedAt,
      }
    : {
        method: "upi",
        upiTransactionId: "",
        proofFileName: "",
        proofDataUrl: "",
      },
  requestedAt: request.requestedAt,
  reviewedAt: request.reviewedAt,
  reviewedBy: request.reviewedBy,
  responseNote: request.responseNote || "",
});

const buildAdminResponse = async (admin, message) => {
  const issuedCount = admin.role === "super_admin" ? 0 : await getIssuedCount(admin._id);

  return {
    _id: admin._id,
    name: admin.name,
    email: admin.email,
    walletAddress: admin.walletAddress || "",
    role: admin.role || "admin",
    status: admin.status || "active",
    plan: buildPlanResponse(admin, issuedCount),
    planUpgradeRequest: normalizePlanUpgradeRequestResponse(admin.planUpgradeRequest || {}),
    branding: normalizeBranding(admin.branding || {}),
    institutionKey: admin.institutionKey || "",
    institutionVerification: getInstitutionVerificationResponse(admin),
    institutionDocuments: getInstitutionDocumentsResponse(admin),
    createdAt: admin.createdAt,
    lastLoginAt: admin.lastLoginAt,
    ...(message ? { message } : {}),
  };
};

const buildManagedAdminResponse = async (admin) => {
  const issuedCount = await getIssuedCount(admin._id);

  return {
    _id: admin._id,
    name: admin.name,
    email: admin.email,
    walletAddress: admin.walletAddress || "",
    role: admin.role || "admin",
    status: admin.status || "active",
    plan: buildPlanResponse(admin, issuedCount),
    planUpgradeRequest: normalizePlanUpgradeRequestResponse(admin.planUpgradeRequest || {}),
    branding: normalizeBranding(admin.branding || {}),
    institutionKey: admin.institutionKey || "",
    institutionVerification: getInstitutionVerificationResponse(admin),
    institutionDocuments: getInstitutionDocumentsResponse(admin),
    suspendedAt: admin.suspendedAt,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
    lastLoginAt: admin.lastLoginAt,
  };
};

const managedAdminFilter = { role: { $ne: "super_admin" } };
const managedAdminByIdFilter = (adminId) => ({
  _id: adminId,
  role: { $ne: "super_admin" },
});

const sanitizeActivityDetailsForSuperAdmin = (details = {}) => {
  const safeKeys = [
    "role",
    "status",
    "planName",
    "planStatus",
    "certificateLimit",
    "expiresAt",
    "requestedPlan",
    "requestStatus",
    "paymentMethod",
    "upiTransactionId",
    "paymentProofFileName",
    "paymentSubmitted",
    "institutionStatus",
    "instituteName",
    "documentTypes",
    "brandingChanged",
    "documentsChanged",
    "passwordChanged",
    "walletChanged",
  ];

  return safeKeys.reduce((acc, key) => {
    if (details?.[key] !== undefined) {
      acc[key] = details[key];
    }
    return acc;
  }, {});
};

const sanitizeActivityLogForSuperAdmin = (log) => {
  const record = typeof log.toObject === "function" ? log.toObject() : log;
  const populatedAdmin = record.adminId && typeof record.adminId === "object"
    ? record.adminId
    : null;

  return {
    _id: record._id,
    action: record.action,
    actor: record.actor || "System",
    adminId: populatedAdmin?._id || record.adminId,
    adminName: populatedAdmin?.name || "",
    adminEmail: populatedAdmin?.email || record.adminEmail || "",
    message: record.message,
    details: sanitizeActivityDetailsForSuperAdmin(record.details || {}),
    createdAt: record.createdAt,
  };
};

const validateSignupPayload = ({ name, email, password, walletAddress }) => {
  if (!name || !email || !password) {
    return "Name, email, and password are required";
  }

  if (!isValidEmail(email)) {
    return "A valid email address is required";
  }

  if (String(password).length < 6) {
    return "Password must be at least 6 characters long";
  }

  if (walletAddress && !isValidWalletAddress(walletAddress)) {
    return "A valid wallet address is required";
  }

  return "";
};

const clearPasswordReset = (admin) => {
  admin.passwordResetCode = undefined;
  admin.passwordResetExpiresAt = undefined;
  admin.passwordResetRequestedAt = undefined;
};

const issueSignupOtp = async ({ name, email }) => {
  const otp = String(crypto.randomInt(100000, 1000000));
  const normalizedEmail = normalizeEmail(email);

  let signupOtp = await AdminSignupOtp.findOne({ email: normalizedEmail }).select(
    "+otpHash"
  );
  if (!signupOtp) {
    signupOtp = new AdminSignupOtp({ email: normalizedEmail });
  }

  await signupOtp.setOtp(otp);
  await signupOtp.save();

  try {
    const emailResult = await sendSignupOtpEmail({
      to: normalizedEmail,
      name,
      otp,
    });

    if (emailResult.skipped) {
      await AdminSignupOtp.deleteOne({ email: normalizedEmail });
      return emailResult;
    }

    return emailResult;
  } catch (error) {
    await AdminSignupOtp.deleteOne({ email: normalizedEmail });
    throw error;
  }
};

const verifySignupOtp = async ({ email, otp }) => {
  const normalizedEmail = normalizeEmail(email);
  const signupOtp = await AdminSignupOtp.findOne({ email: normalizedEmail }).select(
    "+otpHash"
  );

  if (!signupOtp || signupOtp.expiresAt.getTime() < Date.now()) {
    if (signupOtp) await AdminSignupOtp.deleteOne({ email: normalizedEmail });
    return { ok: false, message: "Invalid or expired signup OTP" };
  }

  if (signupOtp.attempts >= 5) {
    await AdminSignupOtp.deleteOne({ email: normalizedEmail });
    return { ok: false, message: "Too many wrong OTP attempts. Please resend OTP." };
  }

  const matched = await signupOtp.matchOtp(otp);
  if (!matched) {
    signupOtp.attempts += 1;
    await signupOtp.save();
    return { ok: false, message: "Invalid or expired signup OTP" };
  }

  await AdminSignupOtp.deleteOne({ email: normalizedEmail });
  return { ok: true };
};

router.post("/signup/send-otp", async (req, res) => {
  try {
    if (!publicAdminSignupEnabled) {
      return blockPublicAdminSignup(res);
    }

    const payload = {
      name: String(req.body.name || "").trim(),
      email: normalizeEmail(req.body.email),
      password: String(req.body.password || ""),
      walletAddress: normalizeWalletAddress(req.body.walletAddress),
    };
    const validationMessage = validateSignupPayload(payload);

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const existingAdmin = await Admin.findOne({ email: payload.email });
    if (existingAdmin) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    const emailResult = await issueSignupOtp({
      name: payload.name,
      email: payload.email,
    });

    if (emailResult.skipped) {
      return res.status(503).json({
        message: emailResult.message || "SMTP is not configured.",
      });
    }

    res.json({
      message: "Signup OTP sent to admin email.",
      expiresInMinutes: 10,
    });
  } catch (error) {
    console.error("Signup OTP Error:", error);
    res.status(500).json({
      message: "Signup OTP email could not be sent. Check SMTP settings.",
    });
  }
});

router.post("/signup/resend-otp", async (req, res) => {
  try {
    if (!publicAdminSignupEnabled) {
      return blockPublicAdminSignup(res);
    }

    const payload = {
      name: String(req.body.name || "").trim(),
      email: normalizeEmail(req.body.email),
      password: String(req.body.password || ""),
      walletAddress: normalizeWalletAddress(req.body.walletAddress),
    };
    const validationMessage = validateSignupPayload(payload);

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const existingAdmin = await Admin.findOne({ email: payload.email });
    if (existingAdmin) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    const emailResult = await issueSignupOtp({
      name: payload.name,
      email: payload.email,
    });

    if (emailResult.skipped) {
      return res.status(503).json({
        message: emailResult.message || "SMTP is not configured.",
      });
    }

    res.json({
      message: "New signup OTP sent to admin email.",
      expiresInMinutes: 10,
    });
  } catch (error) {
    console.error("Signup OTP Resend Error:", error);
    res.status(500).json({
      message: "Signup OTP email could not be resent. Check SMTP settings.",
    });
  }
});

// Register new admin
router.post("/register", async (req, res) => {
  try {
    if (!publicAdminSignupEnabled) {
      return blockPublicAdminSignup(res);
    }

    const { name, email, password, otp } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const walletAddress = normalizeWalletAddress(req.body.walletAddress);

    // Validate required fields
    const validationMessage = validateSignupPayload({
      name,
      email: normalizedEmail,
      password,
      walletAddress,
    });
    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    if (!otp) {
      return res.status(400).json({ message: "Signup email OTP is required" });
    }

    // Check for existing admin
    const existingAdmin = await Admin.findOne({ email: normalizedEmail });
    if (existingAdmin) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    const otpResult = await verifySignupOtp({ email: normalizedEmail, otp });
    if (!otpResult.ok) {
      return res.status(400).json({ message: otpResult.message });
    }

    // Create new admin
    const admin = await Admin.create({
      name,
      email: normalizedEmail,
      walletAddress: walletAddress || undefined,
      plan: defaultPlan,
      planUpgradeRequest: {
        status: "none",
      },
      institutionVerification: {
        status: "unverified",
        locked: false,
      },
      password,
    });
    if (!admin) {
      return res.status(400).json({ message: "Failed to register admin" });
    }

    await logActivity({
      action: "admin_signup",
      adminId: admin._id,
      adminEmail: admin.email,
      actor: admin.name || "Admin",
      message: "Admin account created through public signup.",
      details: {
        role: admin.role,
        status: admin.status,
        planName: admin.plan?.name || "trial",
      },
    });

    // Return admin info and JWT
    res.status(201).json({
      ...(await buildAdminResponse(admin)),
      token: generateToken(admin._id),
      message: "Admin registered successfully",
    });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ message: "Could not complete registration. Please try again." });
  }
});

// Login admin
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Find admin by email
    const admin = await Admin.findOne({ email: normalizeEmail(email) });
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Validate password
    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (admin.status === "suspended") {
      return res.status(403).json({ message: "This admin account is suspended" });
    }

    admin.lastLoginAt = new Date();
    await admin.save();

    await logActivity({
      action: "admin_login",
      adminId: admin._id,
      adminEmail: admin.email,
      actor: admin.name || "Admin",
      message: `${admin.role === "super_admin" ? "Super admin" : "Admin"} logged in.`,
      details: {
        role: admin.role || "admin",
        status: admin.status || "active",
      },
    });

    // Send JWT and profile
    res.json({
      ...(await buildAdminResponse(admin)),
      token: generateToken(admin._id),
      message: "Login successful",
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Could not sign in. Please try again." });
  }
});

// Send password reset code to admin email
router.post("/forgot-password", async (req, res) => {
  const genericMessage = "If that admin email exists, a reset code has been sent.";

  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({ message: "Admin email is required" });
    }

    const admin = await Admin.findOne({ email }).select(
      "+passwordResetCode +passwordResetExpiresAt +passwordResetRequestedAt"
    );

    if (!admin) {
      return res.json({ message: genericMessage });
    }

    const resetCode = String(crypto.randomInt(100000, 1000000));
    await admin.setPasswordResetCode(resetCode);
    await admin.save();

    try {
      const emailResult = await sendPasswordResetEmail({
        to: admin.email,
        name: admin.name,
        resetCode,
      });

      if (emailResult.skipped) {
        clearPasswordReset(admin);
        await admin.save();

        return res.status(503).json({
          message: emailResult.message || "SMTP is not configured.",
        });
      }
    } catch (emailError) {
      clearPasswordReset(admin);
      await admin.save();
      console.error("Password Reset Email Error:", emailError);

      return res.status(500).json({
        message: "Password reset email could not be sent. Check SMTP settings.",
      });
    }

    res.json({ message: "Password reset code sent to admin email." });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ message: "Could not send the reset code. Please try again." });
  }
});

// Reset admin password with emailed code
router.post("/reset-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const resetCode = String(req.body.code || "").trim();
    const password = String(req.body.password || "");

    if (!email || !resetCode || !password) {
      return res.status(400).json({ message: "Email, code, and new password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    const admin = await Admin.findOne({ email }).select(
      "+passwordResetCode +passwordResetExpiresAt +passwordResetRequestedAt"
    );

    if (!admin || !admin.passwordResetCode || !admin.passwordResetExpiresAt) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    if (admin.passwordResetExpiresAt.getTime() < Date.now()) {
      clearPasswordReset(admin);
      await admin.save();

      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    const isResetCodeValid = await admin.matchPasswordResetCode(resetCode);
    if (!isResetCodeValid) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    admin.password = password;
    clearPasswordReset(admin);
    await admin.save();

    res.json({ message: "Password updated successfully. You can sign in now." });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ message: "Could not update the password. Please try again." });
  }
});

router.post("/plan-upgrade-request", protect, async (req, res) => {
  try {
    if (req.admin?.role === "super_admin") {
      return res.status(403).json({ message: "Super admins do not request plans." });
    }

    const planName = String(req.body.planName || req.body.name || "")
      .trim()
      .toLowerCase();
    if (!upgradePlanNames.includes(planName)) {
      return res.status(400).json({
        message: "Choose a valid upgrade plan: basic, pro, enterprise, or custom.",
      });
    }

    const rawLimit = req.body.certificateLimit;
    const parsedLimit =
      rawLimit === "" || rawLimit === null || rawLimit === undefined
        ? upgradePlanLimitPresets[planName]
        : Number(rawLimit);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
      return res.status(400).json({
        message: "Requested certificate limit must be at least 1.",
      });
    }

    const paymentMethod = ["upi", "bank_transfer", "cash", "other"].includes(
      String(req.body.paymentMethod || "").trim().toLowerCase()
    )
      ? String(req.body.paymentMethod).trim().toLowerCase()
      : "upi";
    const upiTransactionId = String(req.body.upiTransactionId || "").trim();
    const paymentProofFileName = String(req.body.paymentProofFileName || "").trim();
    const paymentProofDataUrl = String(req.body.paymentProofDataUrl || "").trim();

    if (!upiTransactionId && !paymentProofDataUrl) {
      return res.status(400).json({
        message: "Add a UPI transaction ID or upload a payment screenshot.",
      });
    }

    if (paymentProofDataUrl && !paymentProofDataUrl.startsWith("data:")) {
      return res.status(400).json({
        message: "Payment proof must be uploaded as a valid file.",
      });
    }

    const admin = await Admin.findById(req.admin._id);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    admin.planUpgradeRequest = {
      status: "pending",
      requestedPlan: {
        name: planName,
        status: "active",
        certificateLimit: Math.floor(parsedLimit),
      },
      message: String(req.body.message || "").trim(),
      payment: {
        method: paymentMethod,
        upiTransactionId,
        proofFileName: paymentProofFileName,
        proofDataUrl: paymentProofDataUrl,
        submittedAt: new Date(),
      },
      requestedAt: new Date(),
      reviewedAt: undefined,
      reviewedBy: undefined,
      responseNote: "",
    };
    await admin.save();

    await logActivity({
      action: "plan_upgrade_requested",
      adminId: admin._id,
      adminEmail: admin.email,
      actor: admin.name || "Admin",
      message: "Admin requested a plan upgrade.",
      details: {
        requestedPlan: planName,
        certificateLimit: Math.floor(parsedLimit),
        requestStatus: "pending",
        paymentMethod,
        upiTransactionId,
        paymentProofFileName,
        paymentSubmitted: Boolean(upiTransactionId || paymentProofDataUrl),
      },
    });

    res.json(await buildAdminResponse(admin, "Plan upgrade request sent to super admin."));
  } catch (error) {
    console.error("Plan Upgrade Request Error:", error);
    res.status(500).json({ message: "Could not send the plan request. Please try again." });
  }
});

router.get("/super/admins", protect, superAdminOnly, async (req, res) => {
  try {
    const admins = await Admin.find(managedAdminFilter)
      .sort({ createdAt: -1 })
      .select("-password -passwordResetCode -passwordResetExpiresAt -passwordResetRequestedAt");

    res.json({
      success: true,
      admins: await Promise.all(admins.map(buildManagedAdminResponse)),
    });
  } catch (error) {
    console.error("List Admins Error:", error);
    res.status(500).json({ message: "Could not load admins. Please try again." });
  }
});

router.get("/super/activity/logs", protect, superAdminOnly, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 8, 1), 50);
    const skip = (page - 1) * limit;
    const filter = {};
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
      filter.createdAt = dateQuery;
    }

    if (req.query.adminId) {
      filter.adminId = req.query.adminId;
    }

    if (req.query.search) {
      const search = String(req.query.search).trim();
      filter.$or = [
        { action: { $regex: search, $options: "i" } },
        { actor: { $regex: search, $options: "i" } },
        { adminEmail: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
      ];
    }

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("adminId", "name email")
        .select("-certificateId -studentEmail -__v"),
      ActivityLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      logs: logs.map(sanitizeActivityLogForSuperAdmin),
      total,
      page,
      limit,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (error) {
    console.error("Super Activity Logs Error:", error);
    res.status(500).json({ message: "Could not load activity logs. Please try again." });
  }
});

router.post("/super/admins", protect, superAdminOnly, async (req, res) => {
  try {
    const payload = {
      name: String(req.body.name || "").trim(),
      email: normalizeEmail(req.body.email),
      password: String(req.body.password || ""),
      walletAddress: normalizeWalletAddress(req.body.walletAddress),
    };
    const validationMessage = validateSignupPayload(payload);

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const existingAdmin = await Admin.findOne({ email: payload.email });
    if (existingAdmin) {
      return res.status(409).json({ message: "Admin already exists" });
    }

    const admin = await Admin.create({
      name: payload.name,
      email: payload.email,
      walletAddress: payload.walletAddress || undefined,
      password: payload.password,
      role: "admin",
      status: "active",
      plan: normalizePlan(req.body.plan || {}),
      planUpgradeRequest: {
        status: "none",
      },
      institutionVerification: {
        status: "unverified",
        locked: false,
      },
    });

    await logActivity({
      action: "admin_created",
      adminId: admin._id,
      adminEmail: admin.email,
      actor: req.admin?.name || "Super Admin",
      message: "Super admin created an admin account.",
      details: {
        createdBy: req.admin?.email,
        planName: admin.plan?.name || "trial",
        planStatus: admin.plan?.status || "trial",
        certificateLimit: admin.plan?.certificateLimit || 5,
      },
    });

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      admin: await buildManagedAdminResponse(admin),
    });
  } catch (error) {
    console.error("Create Managed Admin Error:", error);
    res.status(500).json({ message: "Could not create admin. Please try again." });
  }
});

router.patch("/super/admins/:adminId", protect, superAdminOnly, async (req, res) => {
  try {
    const admin = await Admin.findOne(managedAdminByIdFilter(req.params.adminId));
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const walletAddress = normalizeWalletAddress(req.body.walletAddress);
    const password = String(req.body.password || "");

    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "A valid email address is required" });
    }

    if (walletAddress && !isValidWalletAddress(walletAddress)) {
      return res.status(400).json({ message: "A valid wallet address is required" });
    }

    if (password && password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    const duplicateAdmin = await Admin.findOne({
      _id: { $ne: admin._id },
      email,
    });
    if (duplicateAdmin) {
      return res.status(409).json({ message: "Another admin already uses this email" });
    }

    admin.name = name;
    admin.email = email;
    admin.walletAddress = walletAddress || undefined;
    admin.role = "admin";
    if (password) {
      admin.password = password;
    }
    await admin.save();

    await logActivity({
      action: "admin_profile_updated_by_super_admin",
      adminId: admin._id,
      adminEmail: admin.email,
      actor: req.admin?.name || "Super Admin",
      message: "Super admin updated an admin account.",
      details: {
        updatedBy: req.admin?.email,
        passwordChanged: Boolean(password),
        walletChanged: Boolean(walletAddress),
      },
    });

    res.json({
      success: true,
      message: password ? "Admin updated and password reset" : "Admin updated",
      admin: await buildManagedAdminResponse(admin),
    });
  } catch (error) {
    console.error("Update Managed Admin Error:", error);
    res.status(500).json({ message: "Could not update admin. Please try again." });
  }
});

router.patch("/super/admins/:adminId/plan", protect, superAdminOnly, async (req, res) => {
  try {
    const admin = await Admin.findOne(managedAdminByIdFilter(req.params.adminId));
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const plan = normalizePlan(req.body.plan || req.body);

    admin.plan = {
      ...plan,
      updatedAt: new Date(),
      updatedBy: req.admin._id,
    };
    if (admin.planUpgradeRequest?.status === "pending") {
      admin.planUpgradeRequest.status = "approved";
      admin.planUpgradeRequest.reviewedAt = new Date();
      admin.planUpgradeRequest.reviewedBy = req.admin._id;
      admin.planUpgradeRequest.responseNote = "Plan updated by super admin.";
    }
    admin.role = "admin";
    await admin.save();

    await logActivity({
      action: "admin_plan_updated",
      adminId: admin._id,
      adminEmail: admin.email,
      actor: req.admin?.name || "Super Admin",
      message: "Super admin updated the admin plan.",
      details: {
        updatedBy: req.admin?.email,
        planName: admin.plan?.name,
        planStatus: admin.plan?.status,
        certificateLimit: admin.plan?.certificateLimit,
        expiresAt: admin.plan?.expiresAt,
      },
    });

    res.json({
      success: true,
      message: "Admin plan updated",
      admin: await buildManagedAdminResponse(admin),
    });
  } catch (error) {
    console.error("Update Admin Plan Error:", error);
    res.status(500).json({ message: "Could not update the admin plan. Please try again." });
  }
});

router.patch(
  "/super/admins/:adminId/plan-request",
  protect,
  superAdminOnly,
  async (req, res) => {
    try {
      const action = String(req.body.action || "").trim().toLowerCase();
      const responseNote = String(req.body.responseNote || "").trim();
      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({ message: "Action must be approve or reject" });
      }

      const admin = await Admin.findOne(managedAdminByIdFilter(req.params.adminId));
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      const request = admin.planUpgradeRequest || {};
      if (request.status !== "pending" || !request.requestedPlan?.name) {
        return res.status(400).json({ message: "No pending plan request found" });
      }

      if (action === "approve") {
        admin.plan = {
          name: request.requestedPlan.name,
          status: "active",
          certificateLimit: request.requestedPlan.certificateLimit,
          expiresAt: undefined,
          updatedAt: new Date(),
          updatedBy: req.admin._id,
        };
      }

      admin.planUpgradeRequest.status = action === "approve" ? "approved" : "rejected";
      admin.planUpgradeRequest.reviewedAt = new Date();
      admin.planUpgradeRequest.reviewedBy = req.admin._id;
      admin.planUpgradeRequest.responseNote =
        responseNote ||
        (action === "approve"
          ? "Plan request approved by super admin."
          : "Plan request rejected by super admin.");
      admin.role = "admin";
      await admin.save();

      await logActivity({
        action:
          action === "approve"
            ? "plan_upgrade_approved"
            : "plan_upgrade_rejected",
        adminId: admin._id,
        adminEmail: admin.email,
        actor: req.admin?.name || "Super Admin",
        message:
          action === "approve"
            ? "Super admin approved the plan upgrade request."
            : "Super admin rejected the plan upgrade request.",
        details: {
          reviewedBy: req.admin?.email,
          requestedPlan: request.requestedPlan.name,
          certificateLimit: request.requestedPlan.certificateLimit,
          requestStatus: admin.planUpgradeRequest.status,
        },
      });

      res.json({
        success: true,
        message:
          action === "approve"
            ? "Plan request approved and applied"
            : "Plan request rejected",
        admin: await buildManagedAdminResponse(admin),
      });
    } catch (error) {
      console.error("Review Plan Request Error:", error);
      res.status(500).json({ message: "Could not review the plan request. Please try again." });
    }
  }
);

router.patch("/super/admins/:adminId/status", protect, superAdminOnly, async (req, res) => {
  try {
    const status = String(req.body.status || "").trim().toLowerCase();
    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({ message: "Status must be active or suspended" });
    }

    const admin = await Admin.findOne(managedAdminByIdFilter(req.params.adminId));
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    admin.status = status;
    admin.role = "admin";
    admin.suspendedAt = status === "suspended" ? new Date() : undefined;
    admin.suspendedBy = status === "suspended" ? req.admin._id : undefined;
    await admin.save();

    await logActivity({
      action: status === "suspended" ? "admin_suspended" : "admin_activated",
      adminId: admin._id,
      adminEmail: admin.email,
      actor: req.admin?.name || "Super Admin",
      message:
        status === "suspended"
          ? "Super admin suspended the admin account."
          : "Super admin activated the admin account.",
      details: {
        updatedBy: req.admin?.email,
        status,
      },
    });

    res.json({
      success: true,
      message: status === "suspended" ? "Admin suspended" : "Admin activated",
      admin: await buildManagedAdminResponse(admin),
    });
  } catch (error) {
    console.error("Update Admin Status Error:", error);
    res.status(500).json({ message: "Could not update admin status. Please try again." });
  }
});

router.patch(
  "/super/admins/:adminId/institution",
  protect,
  superAdminOnly,
  async (req, res) => {
    try {
      const status = String(req.body.status || "").trim().toLowerCase();
      const note = String(req.body.note || "").trim();
      const allowedStatuses = ["unverified", "pending", "verified", "rejected", "suspended"];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          message:
            "Institution status must be unverified, pending, verified, rejected, or suspended",
        });
      }

      const admin = await Admin.findOne(managedAdminByIdFilter(req.params.adminId));
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      const branding = normalizeBranding(admin.branding || {});
      const institutionKey = normalizeInstitutionKey(branding.instituteName);
      const institutionDocuments = normalizeInstitutionDocuments(
        admin.institutionDocuments || []
      );

      if (status === "verified") {
        if (!institutionKey) {
          return res.status(400).json({
            message: "Add the institute name in admin settings before verification.",
          });
        }

        if (!hasRequiredInstitutionDocuments(institutionDocuments)) {
          return res.status(400).json({
            message:
              "Registration certificate and authorization letter are required before institution verification.",
          });
        }

        const conflict = await findVerifiedInstitutionConflict({
          instituteName: branding.instituteName,
          adminId: admin._id,
          adminEmail: admin.email,
        });

        if (conflict && !isSameAdminIdentity(conflict, admin, req.admin)) {
          return res.status(409).json({
            message: `This institute is already verified for ${conflict.name} (${conflict.email}).`,
          });
        }
      }

      admin.institutionKey = institutionKey || undefined;
      admin.institutionVerification = {
        status,
        locked: status === "verified" || status === "suspended",
        submittedAt:
          admin.institutionVerification?.submittedAt ||
          (institutionKey ? new Date() : undefined),
        reviewedAt: ["verified", "rejected", "suspended", "unverified"].includes(status)
          ? new Date()
          : undefined,
        reviewedBy: ["verified", "rejected", "suspended", "unverified"].includes(status)
          ? req.admin._id
          : undefined,
        note:
          note ||
          (status === "verified"
            ? "Institution approved by super admin."
            : status === "suspended"
              ? "Institution access suspended by super admin."
              : status === "rejected"
                ? "Institution verification rejected by super admin."
                : ""),
      };
      await admin.save();

      await logActivity({
        action: `institution_${status}`,
        adminId: admin._id,
        adminEmail: admin.email,
        actor: req.admin?.name || "Super Admin",
        message: `Super admin set institution status to ${status}.`,
        details: {
          reviewedBy: req.admin?.email,
          institutionStatus: status,
          instituteName: branding.instituteName,
          documentTypes: getInstitutionDocumentTypes(institutionDocuments),
        },
      });

      res.json({
        success: true,
        message:
          status === "verified"
            ? "Institution verified and locked"
            : status === "suspended"
              ? "Institution access suspended"
              : "Institution status updated",
        admin: await buildManagedAdminResponse(admin),
      });
    } catch (error) {
      console.error("Update Institution Verification Error:", error);
      if (error?.code === 11000) {
        return res.status(409).json({
          message: "This institute is already verified for another admin.",
        });
      }
      res.status(500).json({ message: "Could not update institution status. Please try again." });
    }
  }
);

// Get current admin profile (JWT protected)
router.get("/me", protect, async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.json(await buildAdminResponse(req.admin));
  } catch (error) {
    console.error("Profile Error:", error);
    res.status(500).json({ message: "Error fetching admin profile" });
  }
});

// Update current admin profile and institution settings
router.patch("/me", protect, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const branding = normalizeBranding(req.body.branding || {});
    const hasInstitutionDocumentsPayload = Array.isArray(req.body.institutionDocuments);
    const nextInstitutionDocuments = hasInstitutionDocumentsPayload
      ? normalizeInstitutionDocuments(req.body.institutionDocuments)
      : [];
    const requestInstitutionEdit = req.body.requestInstitutionEdit === true;
    const requestInstitutionApproval = req.body.requestInstitutionApproval === true;

    if (!name) {
      return res.status(400).json({ message: "Admin name is required" });
    }

    const admin = await Admin.findById(req.admin._id);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const currentBranding = normalizeBranding(admin.branding || {});
    const currentInstitutionDocuments = normalizeInstitutionDocuments(
      admin.institutionDocuments || []
    );
    const institutionDocuments = hasInstitutionDocumentsPayload
      ? nextInstitutionDocuments
      : currentInstitutionDocuments;
    const institutionChanged = hasInstitutionIdentityChange(currentBranding, branding);
    const institutionDocumentsChanged =
      hasInstitutionDocumentsPayload &&
      hasInstitutionDocumentsChange(currentInstitutionDocuments, institutionDocuments);
    const institutionKey = normalizeInstitutionKey(branding.instituteName);
    const currentPlan = normalizePlan(admin.plan || {});
    const isTrialPlan = currentPlan.name === "trial";
    const currentVerification = getInstitutionVerificationResponse(admin);

    if (
      isTrialPlan &&
      (institutionChanged || institutionDocumentsChanged || requestInstitutionApproval)
    ) {
      return res.status(403).json({
        message:
          "Trial admins cannot access institution branding approval. Upgrade the plan first.",
      });
    }

    if (
      isInstitutionIdentityLocked(admin) &&
      (institutionChanged || institutionDocumentsChanged) &&
      !requestInstitutionEdit
    ) {
      return res.status(409).json({
        message:
          "Verified institution identity is locked. Click Edit before changing institute name, logo, signature, stamp, website, address, or proof documents.",
      });
    }

    if (requestInstitutionApproval && !institutionKey) {
      return res.status(400).json({
        message: "Add the institute name before requesting approval.",
      });
    }

    if (
      requestInstitutionApproval &&
      !hasRequiredInstitutionDocuments(institutionDocuments)
    ) {
      return res.status(400).json({
        message:
          "Upload registration certificate and authorization letter before requesting approval.",
      });
    }

    const shouldSubmitInstitution =
      institutionChanged ||
      institutionDocumentsChanged ||
      (requestInstitutionApproval && currentVerification.status !== "verified");

    if (
      (!isInstitutionIdentityLocked(admin) ||
        requestInstitutionEdit ||
        requestInstitutionApproval) &&
      shouldSubmitInstitution
    ) {
      const conflict = await findVerifiedInstitutionConflict({
        instituteName: branding.instituteName,
        adminId: admin._id,
        adminEmail: admin.email,
      });

      if (conflict && !isSameAdminIdentity(conflict, admin, req.admin)) {
        return res.status(409).json({
          message: `This institute is already verified for ${conflict.name} (${conflict.email}).`,
        });
      }

      admin.institutionKey = institutionKey || undefined;
      admin.institutionVerification = {
        status: institutionKey ? "pending" : "unverified",
        locked: false,
        submittedAt: institutionKey ? new Date() : undefined,
        reviewedAt: undefined,
        reviewedBy: undefined,
        note: institutionKey
          ? requestInstitutionApproval
            ? "Institution approval requested by admin."
            : requestInstitutionEdit
            ? "Institution edit waiting for super admin verification."
            : "Waiting for super admin verification."
          : "",
      };
    }

    admin.name = name;
    admin.branding = branding;
    if (hasInstitutionDocumentsPayload) {
      admin.institutionDocuments = institutionDocuments;
    }
    await admin.save();

    if (shouldSubmitInstitution) {
      await logActivity({
        action: requestInstitutionApproval
          ? "institution_approval_requested"
          : requestInstitutionEdit
          ? "institution_profile_edit_requested"
          : "institution_profile_updated",
        adminId: admin._id,
        adminEmail: admin.email,
        actor: admin.name || "Admin",
        message: requestInstitutionApproval
          ? "Admin requested institution verification."
          : "Admin updated institution branding or proof documents.",
        details: {
          institutionStatus: admin.institutionVerification?.status || "unverified",
          instituteName: branding.instituteName,
          documentTypes: getInstitutionDocumentTypes(institutionDocuments),
          brandingChanged: institutionChanged,
          documentsChanged: institutionDocumentsChanged,
        },
      });
    }

    res.json(await buildAdminResponse(admin, "Settings updated successfully"));
  } catch (error) {
    console.error("Update Admin Settings Error:", error);
    res.status(500).json({ message: "Could not update settings. Please try again." });
  }
});

export default router;

import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BLOCKCERT_LOGO_CID = "blockcert-logo@blockcert";
const DEFAULT_LOGO_PATH = path.resolve(
  __dirname,
  "../assets/email-logo.png"
);
const FALLBACK_LOGO_PATH = path.resolve(
  __dirname,
  "../../../frontend/public/email-logo.png"
);

const getLogoAttachment = () => {
  const logoPath = [process.env.EMAIL_LOGO_PATH, DEFAULT_LOGO_PATH, FALLBACK_LOGO_PATH]
    .filter(Boolean)
    .find((candidatePath) => fs.existsSync(candidatePath));

  if (!logoPath) {
    return null;
  }

  const ext = path.extname(logoPath).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : "image/svg+xml";

  return {
    filename: path.basename(logoPath),
    content: fs.readFileSync(logoPath),
    cid: BLOCKCERT_LOGO_CID,
    contentType,
    disposition: "inline",
  };
};

export const isSmtpConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const maskValue = (value = "") => {
  if (!value) return "";
  const [name, domain] = String(value).split("@");
  if (!domain) return value.length > 3 ? `${value.slice(0, 2)}***` : "***";
  return `${name.slice(0, 2)}***@${domain}`;
};

export const getSmtpStatus = () => {
  const missing = [];
  if (!process.env.SMTP_HOST) missing.push("SMTP_HOST");
  if (!process.env.SMTP_USER) missing.push("SMTP_USER");
  if (!process.env.SMTP_PASS) missing.push("SMTP_PASS");

  return {
    configured: missing.length === 0,
    missing,
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    user: maskValue(process.env.SMTP_USER || ""),
    from:
      process.env.SMTP_FROM ||
      (process.env.SMTP_USER
        ? `"BlockCert Certificate System" <${maskValue(process.env.SMTP_USER)}>`
        : ""),
  };
};

const getTransporter = () => {
  if (!isSmtpConfigured()) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

export const verifySmtpConnection = async () => {
  const transporter = getTransporter();

  if (!transporter) {
    return {
      ok: false,
      message: "SMTP is not configured. Add SMTP_HOST, SMTP_USER, and SMTP_PASS.",
      status: getSmtpStatus(),
    };
  }

  await transporter.verify();

  return {
    ok: true,
    message: "SMTP connection verified successfully.",
    status: getSmtpStatus(),
  };
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const buildCertificateEmailHtml = ({
  studentName,
  courseName,
  certificateId,
  issueDate,
  expiryDate,
  verificationUrl,
  pdfUrl,
  blockchainTx,
  issuedBy,
  issuerWalletAddress,
  certificateText,
  includePublicVerifyLink = true,
  branding = {},
}) => `
  <div style="margin:0;padding:0;background:#09111d;font-family:Inter,Arial,sans-serif;color:#eaf7f6;">
    <div style="max-width:680px;margin:0 auto;padding:32px 18px;">
      <div style="border:1px solid #203241;border-radius:16px;overflow:hidden;background:#101b28;box-shadow:0 24px 70px rgba(0,0,0,.35);">
        <div style="height:6px;background:linear-gradient(135deg,${escapeHtml(branding.primaryColor || "#16c7d9")},${escapeHtml(branding.secondaryColor || "#20c997")},#f6c343);"></div>
        <div style="padding:30px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px;">
            <div style="width:52px;height:52px;border-radius:13px;background:linear-gradient(135deg,#16c7d9,#20c997);display:inline-flex;align-items:center;justify-content:center;overflow:hidden;">
              <img src="${escapeHtml(branding.logoDataUrl || `cid:${BLOCKCERT_LOGO_CID}`)}" width="52" height="52" alt="BlockCert logo" style="display:block;width:52px;height:52px;border:0;border-radius:13px;object-fit:cover;" />
            </div>
            <div>
              <div style="font-size:22px;font-weight:800;color:#ffffff;">${escapeHtml(branding.instituteName || "BlockCert")}</div>
              <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#16c7d9;font-weight:700;">Certificate Issued</div>
            </div>
          </div>

          <h1 style="margin:0 0 12px;font-size:30px;line-height:1.2;color:#ffffff;">Congratulations, ${escapeHtml(studentName)}!</h1>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#b8c9c8;">
            Your certificate for <strong style="color:#ffffff;">${escapeHtml(courseName)}</strong> has been issued successfully.
            ${escapeHtml(
              certificateText ||
                (includePublicVerifyLink
                  ? "The PDF certificate is attached to this email, and you can verify it online anytime."
                  : "The PDF certificate is attached to this email.")
            )}
          </p>

          <div style="border:1px solid #243847;border-radius:14px;background:#0b141f;padding:18px;margin-bottom:22px;">
            <table role="presentation" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;color:#7f9696;font-size:13px;">Certificate ID</td>
                <td style="padding:8px 0;color:#ffffff;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(certificateId)}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#7f9696;font-size:13px;">Student Name</td>
                <td style="padding:8px 0;color:#ffffff;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(studentName)}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#7f9696;font-size:13px;">Course</td>
                <td style="padding:8px 0;color:#ffffff;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(courseName)}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#7f9696;font-size:13px;">Issue Date</td>
                <td style="padding:8px 0;color:#ffffff;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(formatDate(issueDate))}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#7f9696;font-size:13px;">Expiry Date</td>
                <td style="padding:8px 0;color:#ffffff;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(expiryDate ? formatDate(expiryDate) : "No expiry")}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#7f9696;font-size:13px;">Issued By</td>
                <td style="padding:8px 0;color:#ffffff;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(issuedBy || "Admin")}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#7f9696;font-size:13px;">Wallet</td>
                <td style="padding:8px 0;color:#ffffff;font-size:12px;font-weight:700;text-align:right;word-break:break-all;">${escapeHtml(issuerWalletAddress || "Not recorded")}</td>
              </tr>
            </table>
          </div>

          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
            ${includePublicVerifyLink ? `<a href="${escapeHtml(verificationUrl)}" style="display:inline-block;background:linear-gradient(135deg,#16c7d9,#20c997);color:#061018;text-decoration:none;font-weight:800;border-radius:10px;padding:13px 18px;">Verify Certificate</a>` : ""}
            <a href="${escapeHtml(pdfUrl)}" style="display:inline-block;border:1px solid #2f4657;color:#eaf7f6;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 18px;">View PDF</a>
          </div>

          <div style="border-left:4px solid #f6c343;background:#171a16;padding:14px 16px;border-radius:10px;margin-bottom:24px;">
            <div style="font-size:13px;color:#f6c343;font-weight:800;margin-bottom:6px;">Blockchain Transaction</div>
            <div style="font-size:12px;color:#b8c9c8;word-break:break-all;">${escapeHtml(blockchainTx)}</div>
          </div>

          <p style="margin:0;font-size:13px;line-height:1.6;color:#7f9696;">
            ${includePublicVerifyLink
              ? "Keep this email for your records. You can share the verification link with recruiters, institutions, or reviewers."
              : "Keep this email and the attached certificate PDF for your records."}
          </p>
          ${branding.instituteAddress || branding.instituteWebsite ? `
            <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#7f9696;">
              ${escapeHtml(branding.instituteAddress || "")}
              ${branding.instituteWebsite ? `<br/><a href="${escapeHtml(branding.instituteWebsite)}" style="color:#16c7d9;">${escapeHtml(branding.instituteWebsite)}</a>` : ""}
            </p>
          ` : ""}
        </div>
      </div>
      <p style="text-align:center;margin:18px 0 0;color:#6f8585;font-size:12px;">
        (c) 2026 ${escapeHtml(branding.instituteName || "BlockCert")}. Certificate verification made simple.
      </p>
    </div>
  </div>
`;

const buildPasswordResetEmailHtml = ({ name, resetCode }) => `
  <div style="margin:0;padding:0;background:#09111d;font-family:Inter,Arial,sans-serif;color:#eaf7f6;">
    <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
      <div style="border:1px solid #203241;border-radius:16px;overflow:hidden;background:#101b28;box-shadow:0 24px 70px rgba(0,0,0,.35);">
        <div style="height:6px;background:linear-gradient(135deg,#20c997,#16c7d9);"></div>
        <div style="padding:30px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:26px;">
            <div style="width:52px;height:52px;border-radius:13px;background:linear-gradient(135deg,#20c997,#16c7d9);display:inline-flex;align-items:center;justify-content:center;overflow:hidden;">
              <img src="cid:${BLOCKCERT_LOGO_CID}" width="52" height="52" alt="BlockCert logo" style="display:block;width:52px;height:52px;border:0;border-radius:13px;" />
            </div>
            <div>
              <div style="font-size:22px;font-weight:800;color:#ffffff;">BlockCert</div>
              <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#16c7d9;font-weight:700;">Admin Password Reset</div>
            </div>
          </div>

          <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#ffffff;">Reset your admin password</h1>
          <p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#b8c9c8;">
            Hi ${escapeHtml(name || "Admin")}, use this verification code to create a new BlockCert admin password.
          </p>

          <div style="border:1px solid #243847;border-radius:14px;background:#0b141f;padding:22px;margin-bottom:22px;text-align:center;">
            <div style="font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#7f9696;font-weight:800;margin-bottom:10px;">Reset Code</div>
            <div style="font-size:34px;letter-spacing:.24em;color:#ffffff;font-weight:900;">${escapeHtml(resetCode)}</div>
          </div>

          <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#b8c9c8;">
            This code expires in 15 minutes. If you did not request a password reset, keep your current password and ignore this email.
          </p>

          <p style="margin:0;font-size:12px;line-height:1.6;color:#7f9696;">
            For your security, BlockCert never sends your existing password by email.
          </p>
        </div>
      </div>
    </div>
  </div>
`;

const buildSignupOtpEmailHtml = ({ name, otp }) => `
  <div style="margin:0;padding:0;background:#09111d;font-family:Inter,Arial,sans-serif;color:#eaf7f6;">
    <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
      <div style="border:1px solid #203241;border-radius:16px;overflow:hidden;background:#101b28;box-shadow:0 24px 70px rgba(0,0,0,.35);">
        <div style="height:6px;background:linear-gradient(135deg,#20c997,#16c7d9,#f6c343);"></div>
        <div style="padding:30px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:26px;">
            <div style="width:52px;height:52px;border-radius:13px;background:linear-gradient(135deg,#20c997,#16c7d9);display:inline-flex;align-items:center;justify-content:center;overflow:hidden;">
              <img src="cid:${BLOCKCERT_LOGO_CID}" width="52" height="52" alt="BlockCert logo" style="display:block;width:52px;height:52px;border:0;border-radius:13px;" />
            </div>
            <div>
              <div style="font-size:22px;font-weight:800;color:#ffffff;">BlockCert</div>
              <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#16c7d9;font-weight:700;">Admin Signup Verification</div>
            </div>
          </div>

          <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#ffffff;">Verify your admin email</h1>
          <p style="margin:0 0 22px;font-size:16px;line-height:1.7;color:#b8c9c8;">
            Hi ${escapeHtml(name || "Admin")}, use this one-time code to finish creating your BlockCert admin account.
          </p>

          <div style="border:1px solid #243847;border-radius:14px;background:#0b141f;padding:22px;margin-bottom:22px;text-align:center;">
            <div style="font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#7f9696;font-weight:800;margin-bottom:10px;">Signup OTP</div>
            <div style="font-size:34px;letter-spacing:.24em;color:#ffffff;font-weight:900;">${escapeHtml(otp)}</div>
          </div>

          <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#b8c9c8;">
            This OTP expires in 10 minutes. If you did not request a BlockCert admin account, you can ignore this email.
          </p>

          <p style="margin:0;font-size:12px;line-height:1.6;color:#7f9696;">
            Your password is never sent by email. Only this short verification code is used.
          </p>
        </div>
      </div>
    </div>
  </div>
`;

export const sendSignupOtpEmail = async ({ to, name, otp }) => {
  const transporter = getTransporter();

  if (!transporter) {
    return {
      sent: false,
      skipped: true,
      message: "SMTP is not configured.",
    };
  }

  const logoAttachment = getLogoAttachment();

  await transporter.sendMail({
    from:
      process.env.SMTP_FROM ||
      `"BlockCert Certificate System" <${process.env.SMTP_USER}>`,
    to,
    subject: "Your BlockCert admin signup OTP",
    html: buildSignupOtpEmailHtml({ name, otp }),
    text: `Hi ${name || "Admin"},

Use this OTP to finish creating your BlockCert admin account:

${otp}

This OTP expires in 10 minutes. If you did not request this account, ignore this email.`,
    attachments: [logoAttachment].filter(Boolean),
  });

  return { sent: true, skipped: false };
};

export const sendPasswordResetEmail = async ({ to, name, resetCode }) => {
  const transporter = getTransporter();

  if (!transporter) {
    return {
      sent: false,
      skipped: true,
      message: "SMTP is not configured.",
    };
  }

  const logoAttachment = getLogoAttachment();

  await transporter.sendMail({
    from:
      process.env.SMTP_FROM ||
      `"BlockCert Certificate System" <${process.env.SMTP_USER}>`,
    to,
    subject: "Reset your BlockCert admin password",
    html: buildPasswordResetEmailHtml({ name, resetCode }),
    text: `Hi ${name || "Admin"},

Use this verification code to reset your BlockCert admin password:

${resetCode}

This code expires in 15 minutes. If you did not request a password reset, ignore this email.

BlockCert never sends your existing password by email.`,
    attachments: [logoAttachment].filter(Boolean),
  });

  return { sent: true, skipped: false };
};

export const sendCertificateEmail = async ({
  to,
  studentName,
  courseName,
  certificateId,
  issueDate,
  expiryDate,
  pdfBase64,
  pdfBuffer,
  pdfFileName,
  ipfsPdfHash,
  blockchainTx,
  issuedBy,
  issuerWalletAddress,
  certificateText,
  includePublicVerifyLink = true,
  branding,
  adminId,
}) => {
  const transporter = getTransporter();

  if (!transporter) {
    return {
      sent: false,
      skipped: true,
      message: "SMTP is not configured.",
    };
  }

  const publicFrontendUrl =
    process.env.FRONTEND_PUBLIC_URL || process.env.FRONTEND_ORIGIN?.split(",")[0];
  const verificationBaseUrl = publicFrontendUrl || "http://localhost:5173";
  const verificationUrl = `${verificationBaseUrl.replace(/\/$/, "")}/verify/${certificateId}${
    adminId ? `?admin=${encodeURIComponent(String(adminId))}` : ""
  }`;
  const pdfUrl = `https://gateway.pinata.cloud/ipfs/${ipfsPdfHash}`;
  const cleanBase64 = String(pdfBase64 || "").replace(/^data:application\/pdf;base64,/, "");
  const pdfContent = pdfBuffer || (cleanBase64 ? Buffer.from(cleanBase64, "base64") : null);

  const subject =
    process.env.CERTIFICATE_EMAIL_SUBJECT ||
    `Your BlockCert Certificate for ${courseName} is Ready`;

  const logoAttachment = getLogoAttachment();
  const attachments = [
    logoAttachment,
    pdfContent
      ? {
          filename: pdfFileName || `${certificateId}_Certificate.pdf`,
          content: pdfContent,
          contentType: "application/pdf",
        }
      : null,
  ].filter(Boolean);

  await transporter.sendMail({
    from:
      process.env.SMTP_FROM ||
      `"BlockCert Certificate System" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html: buildCertificateEmailHtml({
      studentName,
      courseName,
      certificateId,
      issueDate,
      expiryDate,
      verificationUrl,
      pdfUrl,
      blockchainTx,
      issuedBy,
      issuerWalletAddress,
      certificateText,
      includePublicVerifyLink,
      branding,
    }),
    text: `Congratulations ${studentName}!

Your certificate for ${courseName} has been issued.

Certificate ID: ${certificateId}
Issue Date: ${formatDate(issueDate)}
Expiry Date: ${expiryDate ? formatDate(expiryDate) : "No expiry"}
${includePublicVerifyLink ? `Verify: ${verificationUrl}\n` : ""}PDF: ${pdfUrl}
Blockchain Transaction: ${blockchainTx}
Issuer Wallet: ${issuerWalletAddress || "Not recorded"}

The certificate PDF is attached to this email.`,
    attachments,
  });

  return { sent: true, skipped: false };
};

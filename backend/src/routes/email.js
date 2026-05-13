import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getSmtpStatus,
  verifySmtpConnection,
} from "../utils/emailService.js";

const router = express.Router();

router.get("/smtp-status", protect, (req, res) => {
  res.status(200).json({
    success: true,
    smtp: getSmtpStatus(),
  });
});

router.post("/test-smtp", protect, async (req, res) => {
  try {
    const result = await verifySmtpConnection();
    res.status(result.ok ? 200 : 503).json({
      success: result.ok,
      message: result.ok
        ? "Email service is ready."
        : "Email service is not ready. Please check the email configuration.",
      status: {
        configured: result.status?.configured || false,
      },
    });
  } catch (error) {
    res.status(502).json({
      success: false,
      message: "Email service is not ready. Please check the email configuration.",
      smtp: {
        configured: getSmtpStatus().configured,
      },
    });
  }
});

export default router;

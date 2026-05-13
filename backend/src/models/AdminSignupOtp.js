import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const adminSignupOtpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    otpHash: {
      type: String,
      required: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    lastSentAt: {
      type: Date,
      default: Date.now,
    },
    attempts: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

adminSignupOtpSchema.methods.setOtp = async function (otp) {
  this.otpHash = await bcrypt.hash(String(otp), 10);
  this.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  this.lastSentAt = new Date();
  this.attempts = 0;
};

adminSignupOtpSchema.methods.matchOtp = async function (otp) {
  if (!this.otpHash) return false;
  return bcrypt.compare(String(otp), this.otpHash);
};

const AdminSignupOtp = mongoose.model("AdminSignupOtp", adminSignupOtpSchema);
export default AdminSignupOtp;

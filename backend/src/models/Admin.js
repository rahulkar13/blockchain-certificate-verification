import mongoose from "mongoose";
import bcrypt from "bcryptjs";


//  Admin Schema Definition

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Admin name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    walletAddress: {
      type: String,
      required: false,
      trim: true,
      match: [/^0x[a-fA-F0-9]{40}$/, "Please use a valid wallet address"],
    },
    role: {
      type: String,
      enum: ["admin", "super_admin"],
      default: "admin",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      index: true,
    },
    plan: {
      name: {
        type: String,
        enum: ["trial", "basic", "pro", "enterprise", "custom"],
        default: "trial",
      },
      status: {
        type: String,
        enum: ["trial", "active", "paused", "expired"],
        default: "trial",
      },
      certificateLimit: {
        type: Number,
        default: 5,
        min: [0, "Certificate limit cannot be negative"],
      },
      expiresAt: {
        type: Date,
        required: false,
      },
      updatedAt: {
        type: Date,
        required: false,
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        required: false,
      },
    },
    planUpgradeRequest: {
      status: {
        type: String,
        enum: ["none", "pending", "approved", "rejected"],
        default: "none",
        index: true,
      },
      requestedPlan: {
        name: {
          type: String,
          enum: ["basic", "pro", "enterprise", "custom"],
          required: false,
        },
        status: {
          type: String,
          enum: ["active"],
          default: "active",
        },
        certificateLimit: {
          type: Number,
          required: false,
          min: [1, "Certificate limit must be at least 1"],
        },
      },
      message: {
        type: String,
        required: false,
        trim: true,
      },
      payment: {
        method: {
          type: String,
          enum: ["upi", "bank_transfer", "cash", "other"],
          default: "upi",
        },
        upiTransactionId: {
          type: String,
          required: false,
          trim: true,
        },
        proofFileName: {
          type: String,
          required: false,
          trim: true,
        },
        proofDataUrl: {
          type: String,
          required: false,
        },
        submittedAt: {
          type: Date,
          required: false,
        },
      },
      requestedAt: {
        type: Date,
        required: false,
      },
      reviewedAt: {
        type: Date,
        required: false,
      },
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        required: false,
      },
      responseNote: {
        type: String,
        required: false,
        trim: true,
      },
    },
    suspendedAt: {
      type: Date,
      required: false,
    },
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: false,
    },
    lastLoginAt: {
      type: Date,
      required: false,
    },
    branding: {
      instituteName: { type: String, required: false, trim: true },
      instituteWebsite: { type: String, required: false, trim: true },
      instituteAddress: { type: String, required: false, trim: true },
      logoDataUrl: { type: String, required: false },
      signatureDataUrl: { type: String, required: false },
      stampDataUrl: { type: String, required: false },
      certificateTitle: { type: String, required: false, trim: true },
      certificateBody: { type: String, required: false, trim: true },
      certificateFooter: { type: String, required: false, trim: true },
      primaryColor: { type: String, required: false, trim: true },
      secondaryColor: { type: String, required: false, trim: true },
    },
    institutionKey: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },
    institutionVerification: {
      status: {
        type: String,
        enum: ["unverified", "pending", "verified", "rejected", "suspended"],
        default: "unverified",
        index: true,
      },
      locked: {
        type: Boolean,
        default: false,
      },
      submittedAt: {
        type: Date,
        required: false,
      },
      reviewedAt: {
        type: Date,
        required: false,
      },
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        required: false,
      },
      note: {
        type: String,
        required: false,
        trim: true,
      },
    },
    institutionDocuments: [
      {
        type: {
          type: String,
          enum: ["registration_certificate", "authorization_letter", "other"],
          required: true,
        },
        label: {
          type: String,
          required: false,
          trim: true,
        },
        fileName: {
          type: String,
          required: false,
          trim: true,
        },
        dataUrl: {
          type: String,
          required: true,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters long"],
    },
    passwordResetCode: {
      type: String,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
    },
    passwordResetRequestedAt: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true, 
  }
);

adminSchema.index(
  { institutionKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      institutionKey: { $exists: true, $type: "string" },
      "institutionVerification.status": "verified",
    },
  }
);


//  Hash password before saving
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});


//  Compare password method

adminSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

adminSchema.methods.setPasswordResetCode = async function (resetCode) {
  this.passwordResetCode = await bcrypt.hash(String(resetCode), 10);
  this.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  this.passwordResetRequestedAt = new Date();
};

adminSchema.methods.matchPasswordResetCode = async function (enteredCode) {
  if (!this.passwordResetCode) return false;
  return bcrypt.compare(String(enteredCode), this.passwordResetCode);
};


//  Export Admin Model

const Admin = mongoose.model("Admin", adminSchema);
export default Admin;

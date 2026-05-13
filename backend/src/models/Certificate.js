import mongoose from "mongoose";

const certificateSchema = new mongoose.Schema(
  {
    certificateId: { type: String, required: true },
    chainCertificateId: { type: String, required: false },
    studentName: { type: String, required: true },
    studentEmail: { type: String, required: false },
    courseName: { type: String, required: true },
    issueDate: { type: Date, required: true },
    expiryDate: { type: Date, required: false },
    template: {
      type: String,
      enum: ["achievement", "completion", "internship", "participation"],
      default: "completion",
    },

    ipfsPdfHash: { type: String, required: true },
    metadataCid: { type: String, required: false },
    blockchainTx: { type: String, required: true },
    chainStatus: {
      type: String,
      enum: ["pending", "confirmed", "failed"],
      default: "confirmed",
    },
    chainConfirmedAt: { type: Date, required: false },
    chainError: { type: String, required: false },

    pdfFileName: { type: String, required: false },
    certificateText: { type: String, required: false },
    brandingSnapshot: { type: Object, required: false },
    institutionVerificationSnapshot: { type: Object, required: false },

    issuedBy: { type: String, default: "Admin" },
    issuedByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: false,
      index: true,
    },
    issuedByEmail: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
    },
    issuerWalletAddress: { type: String, required: false, trim: true },
    emailStatus: {
      type: String,
      enum: ["not_started", "waiting_chain", "queued", "sent", "failed", "skipped"],
      default: "not_started",
    },
    emailSentAt: { type: Date, required: false },
    emailError: { type: String, required: false },
    emailHistory: [
      {
        status: { type: String, required: true },
        message: { type: String, required: false },
        sentAt: { type: Date, default: Date.now },
        action: { type: String, default: "send" },
      },
    ],
    editedAt: { type: Date, required: false },
    editedBy: { type: String, required: false },
    editNote: { type: String, required: false },
    editHistory: [
      {
        editedAt: { type: Date, default: Date.now },
        editedBy: { type: String, default: "Admin" },
        note: { type: String, required: false },
        changes: { type: Object, required: false },
      },
    ],
    reissueHistory: [
      {
        reissuedAt: { type: Date, default: Date.now },
        reissuedBy: { type: String, default: "Admin" },
        note: { type: String, required: false },
        revokeTx: { type: String, required: false },
        blockchainTx: { type: String, required: false },
        previous: { type: Object, required: false },
        next: { type: Object, required: false },
      },
    ],
    revoked: { type: Boolean, default: false },
    revokedAt: { type: Date, required: false },
    revokedBy: { type: String, required: false },
    revokeTx: { type: String, required: false },
  },
  { timestamps: true }
);

certificateSchema.index(
  { issuedByAdminId: 1, certificateId: 1 },
  {
    unique: true,
    partialFilterExpression: { issuedByAdminId: { $type: "objectId" } },
  }
);
certificateSchema.index({ chainCertificateId: 1 }, { unique: true, sparse: true });

const Certificate = mongoose.model("Certificate", certificateSchema);

export const ensureCertificateIndexes = async () => {
  let indexes = [];
  try {
    indexes = await Certificate.collection.indexes();
  } catch (error) {
    if (error?.codeName !== "NamespaceNotFound" && error?.code !== 26) {
      throw error;
    }
  }

  const oldCertificateIdIndex = indexes.find(
    (index) => index.name === "certificateId_1" && index.unique
  );

  if (oldCertificateIdIndex) {
    await Certificate.collection.dropIndex("certificateId_1");
  }

  await Certificate.collection.createIndex(
    { issuedByAdminId: 1, certificateId: 1 },
    {
      unique: true,
      partialFilterExpression: { issuedByAdminId: { $type: "objectId" } },
      name: "issuedByAdminId_1_certificateId_1",
    }
  );
  await Certificate.collection.createIndex(
    { chainCertificateId: 1 },
    { unique: true, sparse: true, name: "chainCertificateId_1" }
  );
};

export default Certificate;

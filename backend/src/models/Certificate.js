import mongoose from "mongoose";

const certificateSchema = new mongoose.Schema(
  {
    certificateId: { type: String, required: true, unique: true },
    studentName: { type: String, required: true },
    courseName: { type: String, required: true },
    issueDate: { type: Date, required: true },

    ipfsPdfHash: { type: String, required: true },
    blockchainTx: { type: String, required: true },

    pdfFileName: { type: String, required: false },

    issuedBy: { type: String, default: "Admin" },
  },
  { timestamps: true }
);

const Certificate = mongoose.model("Certificate", certificateSchema);

export default Certificate;

import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    certificateId: { type: String, required: false },
    studentEmail: { type: String, required: false },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: false,
      index: true,
    },
    adminEmail: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
    },
    actor: { type: String, default: "System" },
    message: { type: String, required: true },
    details: { type: Object, required: false },
  },
  { timestamps: true }
);

const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);

export default ActivityLog;

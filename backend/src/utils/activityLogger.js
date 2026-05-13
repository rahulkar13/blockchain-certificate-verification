import ActivityLog from "../models/ActivityLog.js";

export const logActivity = async ({
  action,
  certificateId,
  studentEmail,
  adminId,
  adminEmail,
  actor = "System",
  message,
  details,
}) => {
  try {
    await ActivityLog.create({
      action,
      certificateId,
      studentEmail,
      adminId,
      adminEmail,
      actor,
      message,
      details,
    });
  } catch (error) {
    console.error("Activity log error:", error);
  }
};

import dotenv from "dotenv";
import mongoose from "mongoose";
import Admin from "../src/models/Admin.js";

dotenv.config();

const email = String(process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.SUPER_ADMIN_PASSWORD || "");
const name = String(process.env.SUPER_ADMIN_NAME || "Super Admin").trim();

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is required.");
  process.exit(1);
}

if (!email || !password) {
  console.error("SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required.");
  process.exit(1);
}

if (password.length < 6) {
  console.error("SUPER_ADMIN_PASSWORD must be at least 6 characters long.");
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGO_URI);

  let superAdmin = await Admin.findOne({ email });
  if (!superAdmin) {
    superAdmin = new Admin({ email });
  }

  superAdmin.name = name || "Super Admin";
  superAdmin.password = password;
  superAdmin.role = "super_admin";
  superAdmin.status = "active";
  superAdmin.suspendedAt = undefined;
  superAdmin.suspendedBy = undefined;
  await superAdmin.save();

  console.log(`Super admin seeded: ${superAdmin.email}`);
  await mongoose.disconnect();
  process.exit(0);
} catch (error) {
  console.error("Failed to seed super admin:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
}

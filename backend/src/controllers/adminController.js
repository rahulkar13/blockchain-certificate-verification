import express from "express";
import { registerAdmin, loginAdmin } from "../controllers/adminController.js";
import { protect } from "../middleware/authMiddleware.js";
import Admin from "../models/Admin.js";

const router = express.Router();

//  Register new admin
router.post("/register", registerAdmin);

//  Admin login
router.post("/login", loginAdmin);

//  Protected admin profile
router.get("/me", protect, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).select("-password");
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    res.json(admin);
  } catch (err) {
    res.status(500).json({ message: "Could not load admin data. Please try again." });
  }
});

export default router;

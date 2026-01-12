import express from "express";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// Register new admin
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check for existing admin
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    // Create new admin
    const admin = await Admin.create({ name, email, password });
    if (!admin) {
      return res.status(400).json({ message: "Failed to register admin" });
    }

    // Return admin info and JWT
    res.status(201).json({
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      token: generateToken(admin._id),
      message: "Admin registered successfully",
    });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// Login admin
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Find admin by email
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Validate password
    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Send JWT and profile
    res.json({
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      token: generateToken(admin._id),
      message: "Login successful",
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
});

// Get current admin profile (JWT protected)
router.get("/me", protect, async (req, res) => {
  try {
    if (!req.admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.json({
      _id: req.admin._id,
      name: req.admin.name,
      email: req.admin.email,
      createdAt: req.admin.createdAt,
    });
  } catch (error) {
    console.error("Profile Error:", error);
    res.status(500).json({ message: "Error fetching admin profile" });
  }
});

export default router;

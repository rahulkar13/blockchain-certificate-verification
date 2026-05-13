import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./src/config/db.js";

// Certificate routes
import issueRoute from "./src/routes/issue.js";
import verifyRoute from "./src/routes/verify.js";
import configRoutes from "./src/routes/config.js";
import ipfsRoutes from "./src/routes/ipfs.js";
import emailRoutes from "./src/routes/email.js";

// Admin routes
import adminRoutes from "./src/routes/adminRoutes.js";

// Environment setup
dotenv.config();

// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGIN ||
  "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080")
  .split(",")
  .map((origin) => origin.trim());

// Enable CORS for frontend
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "20mb" }));

// Routes
app.use("/api/issue", issueRoute);
app.use("/api/verify", verifyRoute);
app.use("/api/admin", adminRoutes);
app.use("/api/config", configRoutes);
app.use("/api/ipfs", ipfsRoutes);
app.use("/api/email", emailRoutes);

// Health check route
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "BlockCert service is running",
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack);
  res.status(500).json({ message: "Something went wrong. Please try again." });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

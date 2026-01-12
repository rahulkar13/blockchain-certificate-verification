import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./src/config/db.js";

// Certificate routes
import issueRoute from "./src/routes/issue.js";
import verifyRoute from "./src/routes/verify.js";

// Admin routes
import adminRoutes from "./src/routes/adminRoutes.js";

// Environment setup
dotenv.config();

// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();

// Enable CORS for frontend
app.use(
  cors({
    origin: "http://localhost:8080",
    credentials: true,
  })
);

app.use(express.json());

// Routes
app.use("/api/issue", issueRoute);
app.use("/api/verify", verifyRoute);
app.use("/api/admin", adminRoutes);

// Health check route
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "Blockchain Certificate Backend is running",
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

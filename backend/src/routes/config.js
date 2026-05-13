import express from "express";

const router = express.Router();

router.get("/public", (req, res) => {
  res.json({
    contractAddress: process.env.CONTRACT_ADDRESS,
    rpcUrl: process.env.SEPOLIA_RPC_URL,
    chainId: Number(process.env.CHAIN_ID || 11155111),
    networkName: process.env.NETWORK_NAME || "sepolia",
  });
});

export default router;

const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const FRONTEND_PUBLIC_SEPOLIA_RPC = "https://ethereum-sepolia.publicnode.com";

const upsertEnvValue = (envData, key, value) => {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(envData)) {
    return envData.replace(pattern, line);
  }

  return `${envData.trim()}\n${line}\n`;
};

const updateEnvFile = (envFilePath, values) => {
  let envData = "";

  if (fs.existsSync(envFilePath)) {
    envData = fs.readFileSync(envFilePath, "utf8");
  }

  for (const [key, value] of Object.entries(values)) {
    envData = upsertEnvValue(envData, key, value);
  }

  fs.writeFileSync(envFilePath, envData, "utf8");
};

async function main() {
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  const balance = await deployer.getBalance();

  console.log("Deploying smart contract...");
  console.log("Deployer address:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(balance), "ETH");

  // Ensure deployer has ETH
  if (balance.eq(0)) {
    throw new Error("Deployer account has 0 ETH. Please fund it before deploying.");
  }

  // Deploy CertificateRegistry contract
  const CertificateRegistry = await ethers.getContractFactory("CertificateRegistry");
  const certificateRegistry = await CertificateRegistry.deploy();
  await certificateRegistry.deployed();

  const contractAddress = certificateRegistry.address;
  console.log("CertificateRegistry deployed at:", contractAddress);

  // Update frontend environment file
  updateEnvFile(path.join(__dirname, "../../frontend/.env"), {
    VITE_CONTRACT_ADDRESS: contractAddress,
    VITE_CHAIN_ID: "11155111",
    VITE_NETWORK_NAME: "sepolia",
    VITE_RPC_URL: FRONTEND_PUBLIC_SEPOLIA_RPC,
  });

  updateEnvFile(path.join(__dirname, "../.env"), {
    CONTRACT_ADDRESS: contractAddress,
  });

  console.log("Frontend .env updated for Sepolia");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});

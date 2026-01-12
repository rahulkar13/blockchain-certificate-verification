const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

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
  const envFilePath = path.join(__dirname, "../../frontend/.env");
  let envData = "";

  if (fs.existsSync(envFilePath)) {
    envData = fs.readFileSync(envFilePath, "utf8");
  }

  // Remove old contract address if present
  envData = envData.replace(/VITE_CONTRACT_ADDRESS=.*/g, "").trim();

  // Add new contract address
  envData += `\nVITE_CONTRACT_ADDRESS=${contractAddress}\n`;

  fs.writeFileSync(envFilePath, envData, "utf8");
  console.log("Frontend .env updated with new contract address");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});

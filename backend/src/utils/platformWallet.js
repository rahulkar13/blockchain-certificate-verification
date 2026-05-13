import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_PATH = path.resolve(
  __dirname,
  "../../../smart-contracts/artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json"
);

let contractAbi;

const getContractAbi = () => {
  if (!contractAbi) {
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));
    contractAbi = artifact.abi;
  }

  return contractAbi;
};

const getRequiredEnv = (name, fallbackName) => {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : "");
  if (!value) {
    throw new Error(`${name}${fallbackName ? ` or ${fallbackName}` : ""} is required.`);
  }

  return value;
};

const normalizePrivateKey = (value) => {
  const privateKey = String(value || "").trim();
  if (!privateKey) {
    throw new Error("PLATFORM_WALLET_PRIVATE_KEY is required.");
  }

  return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
};

const normalizeBytes32Hash = (hash) => {
  const value = String(hash || "").trim();
  const normalized = value.startsWith("0x") ? value : `0x${value}`;

  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error("Certificate file hash must be a 32-byte hex value.");
  }

  return normalized;
};

const getPlatformContext = () => {
  const rpcUrl = getRequiredEnv("SEPOLIA_RPC_URL", "RPC_URL");
  const contractAddress = getRequiredEnv("CONTRACT_ADDRESS");
  const privateKey = normalizePrivateKey(
    process.env.PLATFORM_WALLET_PRIVATE_KEY || process.env.PRIVATE_KEY
  );
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, getContractAbi(), wallet);

  return { provider, wallet, contract, contractAddress };
};

export const getPlatformWalletAddress = () => {
  const privateKey = normalizePrivateKey(
    process.env.PLATFORM_WALLET_PRIVATE_KEY || process.env.PRIVATE_KEY
  );
  return new ethers.Wallet(privateKey).address;
};

export const getPlatformRecipientAddress = () => {
  const configuredRecipient = String(
    process.env.PLATFORM_RECIPIENT_WALLET_ADDRESS || ""
  ).trim();

  if (configuredRecipient) {
    if (!ethers.isAddress(configuredRecipient)) {
      throw new Error("PLATFORM_RECIPIENT_WALLET_ADDRESS is not a valid wallet address.");
    }

    return configuredRecipient;
  }

  return getPlatformWalletAddress();
};

export const issueCertificateWithPlatformWallet = async ({
  certificateId,
  fileHash,
  metadataCid,
  recipientAddress,
}) => {
  const { contract, wallet } = getPlatformContext();
  const recipient = recipientAddress || getPlatformRecipientAddress();

  if (!ethers.isAddress(recipient)) {
    throw new Error("Recipient wallet address is not valid.");
  }

  const tx = await contract.issueCertificate(
    BigInt(certificateId),
    normalizeBytes32Hash(fileHash),
    metadataCid,
    recipient
  );

  return {
    hash: tx.hash,
    platformWalletAddress: wallet.address,
    recipientWalletAddress: recipient,
    wait: () => tx.wait(),
  };
};

export const issueCertificatesWithPlatformWallet = async (certificates) => {
  const { contract, wallet } = getPlatformContext();
  const recipient = getPlatformRecipientAddress();

  const tx = await contract.issueCertificates(
    certificates.map((certificate) => BigInt(certificate.certificateId)),
    certificates.map((certificate) => normalizeBytes32Hash(certificate.fileHash)),
    certificates.map((certificate) => certificate.metadataCid),
    certificates.map(() => recipient)
  );

  return {
    hash: tx.hash,
    platformWalletAddress: wallet.address,
    recipientWalletAddress: recipient,
    wait: () => tx.wait(),
  };
};

export const revokeCertificateWithPlatformWallet = async (certificateId) => {
  const { contract, wallet } = getPlatformContext();
  const tx = await contract.revokeCertificate(BigInt(certificateId));

  return {
    hash: tx.hash,
    platformWalletAddress: wallet.address,
    wait: () => tx.wait(),
  };
};

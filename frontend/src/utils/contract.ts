import { ethers } from "ethers";
// Import ABI JSON compiled by Hardhat
import contractArtifact from "../../../smart-contracts/artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json";

export const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS as string;

if (!contractAddress) {
  throw new Error("❌ Contract address is missing! Check your .env file.");
}


export const contractABI = contractArtifact.abi;

export const getContract = async (): Promise<ethers.Contract | null> => {
  const win = window as any;
  if (!win.ethereum) {
    alert("MetaMask / Ethereum provider not detected. Please install MetaMask.");
    return null;
  }

  await win.ethereum.request({ method: "eth_requestAccounts" });

  const provider = new ethers.BrowserProvider(win.ethereum);
  const signer = await provider.getSigner();

  return new ethers.Contract(contractAddress, contractABI, signer);
};

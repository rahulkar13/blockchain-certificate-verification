import { ethers } from "ethers";
import contractArtifact from "../../../smart-contracts/artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json";
import { getApiBaseUrl } from "@/utils/api";

type ChainConfig = {
  contractAddress: string;
  rpcUrl: string;
  chainId: number;
  networkName: string;
};

export const contractABI = contractArtifact.abi;

let configPromise: Promise<ChainConfig> | null = null;

const toHexChainId = (chainId: number) => `0x${chainId.toString(16)}`;

export const getChainConfig = async (): Promise<ChainConfig> => {
  if (!configPromise) {
    configPromise = fetch(`${getApiBaseUrl()}/api/config/public`).then(async (res) => {
      if (!res.ok) {
        throw new Error("Certificate verification service is not ready. Please try again later.");
      }

      const config = await res.json();

      if (!config.contractAddress || !config.rpcUrl) {
        throw new Error("Certificate verification service is not ready. Please try again later.");
      }

      return config;
    });
  }

  return configPromise;
};

export const getReadOnlyContract = async (): Promise<ethers.Contract> => {
  const config = await getChainConfig();
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  return new ethers.Contract(config.contractAddress, contractABI, provider);
};

const ensureWalletNetwork = async (ethereum: any, chainId: number) => {
  const currentChainId = await ethereum.request({ method: "eth_chainId" });
  const expectedChainId = toHexChainId(chainId);

  if (currentChainId === expectedChainId) {
    return;
  }

  await ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: expectedChainId }],
  });
};

export const getContract = async (): Promise<ethers.Contract | null> => {
  const win = window as any;
  if (!win.ethereum) {
    alert("Wallet connection is not available in this browser.");
    return null;
  }

  const config = await getChainConfig();

  await win.ethereum.request({ method: "eth_requestAccounts" });
  await ensureWalletNetwork(win.ethereum, config.chainId);

  const provider = new ethers.BrowserProvider(win.ethereum);
  const signer = await provider.getSigner();

  return new ethers.Contract(config.contractAddress, contractABI, signer);
};

import { getContract } from "@/utils/contract";

const isWalletAddress = (value?: string) =>
  /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());

const getSavedAdminWalletAddress = () => {
  try {
    const adminUser = JSON.parse(localStorage.getItem("adminUser") || "{}");
    const walletAddress = String(adminUser.walletAddress || "").trim();
    return isWalletAddress(walletAddress) ? walletAddress : "";
  } catch {
    return "";
  }
};

const getRecipientWalletAddress = async () => {
  const savedWalletAddress = getSavedAdminWalletAddress();
  if (savedWalletAddress) {
    return savedWalletAddress;
  }

  const win = window as any;
  const accounts = await win.ethereum?.request?.({ method: "eth_accounts" });
  const connectedWalletAddress = accounts?.[0] || "";

  if (isWalletAddress(connectedWalletAddress)) {
    return connectedWalletAddress;
  }

  throw new Error("Admin account is not ready for certificate issuing.");
};

export const issueCertificateOnBlockchain = async (
  certId: string,
  hash: string,
  metadataCid: string
) => {
  const contract = await getContract();
  const recipient = await getRecipientWalletAddress();

  if (!contract) {
    throw new Error("Certificate issuing service is not available. Please try again later.");
  }

  const tx = await (contract as any).issueCertificate(
    BigInt(certId),
    `0x${hash}`,
    metadataCid,
    recipient
  );

  return tx;
};

type BatchCertificateInput = {
  certId: string;
  hash: string;
  metadataCid: string;
};

export const issueCertificatesOnBlockchain = async (
  certificates: BatchCertificateInput[]
) => {
  const contract = await getContract();
  const recipient = await getRecipientWalletAddress();

  if (!contract) {
    throw new Error("Certificate issuing service is not available. Please try again later.");
  }

  const tx = await (contract as any).issueCertificates(
    certificates.map((certificate) => BigInt(certificate.certId)),
    certificates.map((certificate) => `0x${certificate.hash}`),
    certificates.map((certificate) => certificate.metadataCid),
    certificates.map(() => recipient)
  );

  return tx;
};

import { getContract } from "@/utils/contract";

export const revokeCertificateOnBlockchain = async (certId: string) => {
  const contract = await getContract();

  if (!contract) {
    throw new Error("Certificate revoke service is not available. Please try again later.");
  }

  return (contract as any).revokeCertificate(BigInt(certId));
};

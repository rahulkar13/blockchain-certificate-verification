import { getContract } from "@/utils/contract";

export const issueCertificateOnBlockchain = async (
  certId: string,
  hash: string,
  metadataCid: string
) => {
  const contract = await getContract();
  const recipient = "0x6c03c883778A7Ee71ad4EA7D34C111a1BE6Ffed2";

  const tx = await (contract as any).issueCertificate(
    BigInt(certId),
    `0x${hash}`,
    metadataCid,
    recipient
  );

  return tx;
};

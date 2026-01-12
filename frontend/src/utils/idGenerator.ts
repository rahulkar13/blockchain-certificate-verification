import { getContract } from "@/utils/contract";

export const getNextCertificateId = async (): Promise<string> => {
  const contract = await getContract();
  if (!contract) throw new Error("Smart contract not available");

  let nextId = 1n;
  let exists = true;

  while (exists) {
    try {
      const existing = await (contract as any).certificates(nextId);
      exists = existing.exists;
      if (exists) nextId++;
    } catch {
      exists = false;
    }
  }

  return nextId.toString().padStart(4, "0");
};

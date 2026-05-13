import { getApiBaseUrl } from "@/utils/api";

export const getNextCertificateId = async (): Promise<string> => {
  const token = localStorage.getItem("adminToken");

  if (token) {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/issue/next-id`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await response.json();

      if (response.ok && payload?.certificateId) {
        return payload.certificateId;
      }
    } catch (error) {
      console.warn("Backend next certificate ID failed.", error);
    }
  }

  throw new Error("Could not generate certificate ID. Please refresh and try again.");
};

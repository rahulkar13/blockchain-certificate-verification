import CryptoJS from "crypto-js";

export const generateFileHash = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = reject;
    reader.onload = () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const uint8 = new Uint8Array(arrayBuffer);
        const wordArray = CryptoJS.lib.WordArray.create(uint8 as any);
        const hash = CryptoJS.SHA256(wordArray).toString().toLowerCase();
        resolve(hash);
      } catch (err) {
        reject(err);
      }
    };

    reader.readAsArrayBuffer(file);
  });
};

const hre = require("hardhat");

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!contractAddress) {
    throw new Error("CONTRACT_ADDRESS is missing in smart-contracts/.env");
  }

  const certId = Number(process.env.CERT_ID || 1);
  const certHash = process.env.CERT_HASH
    ? process.env.CERT_HASH
    : hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes("My Test Certificate"));

  const CertificateRegistry = await hre.ethers.getContractFactory("CertificateRegistry");
  const contract = await CertificateRegistry.attach(contractAddress);

  const [matched, metadataURI, recipient, revoked] = await contract.verifyCertificate(
    certId,
    certHash
  );

  console.log("Contract:", contractAddress);
  console.log("Certificate ID:", certId);
  console.log("Matched:", matched);
  console.log("Metadata URI:", metadataURI);
  console.log("Recipient:", recipient);
  console.log("Revoked:", revoked);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const hre = require("hardhat");

async function main() {
  const contractAddress = "0x0890B2c7fB9d28EAC8f2fCCa04d8AD4945F65b32"; 
  const certId = 1; 
  const certHash = hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes("My Test Certificate"));

  const CertificateRegistry = await hre.ethers.getContractFactory("CertificateRegistry");
  const contract = await CertificateRegistry.attach(contractAddress);

  const [matched, metadataURI, recipient, revoked] = await contract.verifyCertificate(certId, certHash);

  console.log("Matched:", matched);
  console.log("Metadata URI:", metadataURI);
  console.log("Recipient:", recipient);
  console.log("Revoked:", revoked);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

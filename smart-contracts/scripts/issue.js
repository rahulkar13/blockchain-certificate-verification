
const hre = require("hardhat");

async function main() {
  // Address of deployed CertificateRegistry contract
  const contractAddress = "0x0890B2c7fB9d28EAC8f2fCCa04d8AD4945F65b32";

  // Get contract instance
  const CertificateRegistry = await hre.ethers.getContractFactory("CertificateRegistry");
  const certificateRegistry = await CertificateRegistry.attach(contractAddress);

  // Sample certificate data
  const certificateText = "My Test Certificate";
  const certificateHash = hre.ethers.utils.keccak256(
    hre.ethers.utils.toUtf8Bytes(certificateText)
  );

  const metadataURI = "ipfs://QmExampleHash";
  const recipientAddress = "0xe8873BedB0Dc24D787c8Ab4AF26869407241dF5e";

  console.log("Issuing certificate...");
  console.log("Recipient:", recipientAddress);

  // Issue certificate transaction
  const tx = await certificateRegistry.issueCertificate(
    certificateHash,
    metadataURI,
    recipientAddress
  );

  await tx.wait();

  console.log("Certificate issued successfully");
}

main().catch((error) => {
  console.error("Error issuing certificate:", error);
  process.exit(1);
});

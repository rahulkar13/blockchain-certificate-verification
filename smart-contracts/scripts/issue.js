const hre = require("hardhat");

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!contractAddress) {
    throw new Error("CONTRACT_ADDRESS is missing in smart-contracts/.env");
  }

  const CertificateRegistry = await hre.ethers.getContractFactory("CertificateRegistry");
  const certificateRegistry = await CertificateRegistry.attach(contractAddress);

  const certId = Number(process.env.CERT_ID || 1);
  const certificateHash = hre.ethers.utils.keccak256(
    hre.ethers.utils.toUtf8Bytes(process.env.CERT_TEXT || "My Test Certificate")
  );
  const metadataURI = process.env.METADATA_URI || "ipfs://QmExampleHash";
  const recipientAddress =
    process.env.RECIPIENT_ADDRESS || "0xe8873BedB0Dc24D787c8Ab4AF26869407241dF5e";

  console.log("Issuing certificate...");
  console.log("Contract:", contractAddress);
  console.log("Certificate ID:", certId);
  console.log("Recipient:", recipientAddress);

  const tx = await certificateRegistry.issueCertificate(
    certId,
    certificateHash,
    metadataURI,
    recipientAddress
  );

  await tx.wait();

  console.log("Certificate issued successfully");
  console.log("Transaction hash:", tx.hash);
}

main().catch((error) => {
  console.error("Error issuing certificate:", error);
  process.exit(1);
});

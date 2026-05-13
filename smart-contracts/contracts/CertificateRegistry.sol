// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CertificateRegistry
 * @dev A smart contract for issuing, verifying, and revoking academic certificates
 *      on the blockchain. Each certificate is uniquely identified by a certId.
 */
contract CertificateRegistry is Ownable {
    struct Certificate {
        bytes32 certHash;       // Hash of the certificate file (PDF)
        string metadataURI;     // IPFS link to metadata (JSON with details)
        address issuer;         // Address who issued the certificate
        address recipient;      // Recipient wallet address
        bool revoked;           // Whether the certificate is revoked
        bool exists;            // Whether this certificate ID has been used
    }

    /// @dev Mapping of certificate ID → Certificate data
    mapping(uint256 => Certificate) public certificates;

    /// @notice Event emitted when a new certificate is issued
    event CertificateIssued(
        uint256 indexed certId,
        bytes32 certHash,
        address indexed issuer,
        address indexed recipient,
        string metadataURI
    );

    /// @notice Event emitted when a certificate is revoked
    event CertificateRevoked(uint256 indexed certId);

    /**
     * @notice Issue a new certificate
     * @param certId Unique numeric ID for the certificate
     * @param certHash SHA-256 hash of the PDF certificate file
     * @param metadataURI IPFS CID link to metadata JSON
     * @param recipient Recipient wallet address
     */
    function _issueCertificate(
        uint256 certId,
        bytes32 certHash,
        string memory metadataURI,
        address recipient
    ) internal returns (uint256) {
        require(
            !certificates[certId].exists || certificates[certId].revoked,
            "Certificate ID already exists"
        );
        require(recipient != address(0), "Invalid recipient");
        require(certHash != bytes32(0), "Invalid certificate hash");
        require(bytes(metadataURI).length > 0, "Invalid metadata URI");

        certificates[certId] = Certificate({
            certHash: certHash,
            metadataURI: metadataURI,
            issuer: msg.sender,
            recipient: recipient,
            revoked: false,
            exists: true
        });

        emit CertificateIssued(certId, certHash, msg.sender, recipient, metadataURI);
        return certId;
    }

    function issueCertificate(
        uint256 certId,
        bytes32 certHash,
        string memory metadataURI,
        address recipient
    ) public onlyOwner returns (uint256) {
        return _issueCertificate(certId, certHash, metadataURI, recipient);
    }

    /**
     * @notice Issue many certificates in one transaction
     * @param certIds Certificate IDs
     * @param certHashes SHA-256 hashes of PDF certificate files
     * @param metadataURIs IPFS CIDs for metadata JSON
     * @param recipients Recipient wallet addresses
     */
    function issueCertificates(
        uint256[] memory certIds,
        bytes32[] memory certHashes,
        string[] memory metadataURIs,
        address[] memory recipients
    ) public onlyOwner returns (uint256[] memory) {
        uint256 length = certIds.length;
        require(length > 0, "No certificates provided");
        require(length <= 50, "Too many certificates");
        require(
            certHashes.length == length &&
                metadataURIs.length == length &&
                recipients.length == length,
            "Array length mismatch"
        );

        for (uint256 index = 0; index < length; index++) {
            _issueCertificate(
                certIds[index],
                certHashes[index],
                metadataURIs[index],
                recipients[index]
            );
        }

        return certIds;
    }

    /**
     * @notice Revoke an existing certificate (only contract owner)
     * @param certId ID of the certificate to revoke
     */
    function revokeCertificate(uint256 certId) public onlyOwner {
        require(certificates[certId].exists, "Certificate does not exist");
        require(!certificates[certId].revoked, "Certificate already revoked");

        certificates[certId].revoked = true;
        emit CertificateRevoked(certId);
    }

    /**
     * @notice Verify a certificate
     * @param certId Certificate ID
     * @param certHash Hash of the certificate file (pass 0x0 for ID-only verification)
     * @return matched Whether the certificate exists and matches hash
     * @return metadataURI IPFS link to metadata JSON
     * @return recipient Recipient address
     * @return revoked Whether the certificate is revoked
     */
    function verifyCertificate(
        uint256 certId,
        bytes32 certHash
    )
        public
        view
        returns (
            bool matched,
            string memory metadataURI,
            address recipient,
            bool revoked
        )
    {
        require(certificates[certId].exists, "Invalid certificate ID");

        Certificate memory c = certificates[certId];

        if (c.certHash == certHash || certHash == bytes32(0)) {
            return (true, c.metadataURI, c.recipient, c.revoked);
        } else {
            return (false, "", address(0), false);
        }
    }
}

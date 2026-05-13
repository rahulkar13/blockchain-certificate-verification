🎓 Blockchain Certificate Verification System

This project is a decentralized application that enables secure issuance and verification of digital certificates using blockchain technology.
It eliminates the risk of certificate forgery by storing cryptographic proofs on the Ethereum blockchain.

The system is designed to be simple, transparent, and independent of centralized verification authorities.

❓ What Problem It Solves

Traditional certificate verification systems rely on centralized databases that can be altered or compromised. Verifying certificates manually is also slow and unreliable.

This project provides a tamper-proof verification mechanism using blockchain, where certificate authenticity can be verified by anyone.

⚙️ How It Works

👨‍💼 An authorized issuer uploads certificate details

🧮 The certificate file is hashed on the client side

⛓️ The hash is stored on the Ethereum blockchain via a smart contract

☁️ The certificate file is stored on IPFS

📤 For verification, the uploaded certificate is hashed again

✅ The hash is compared with the blockchain record to determine validity

✨ Features

🔐 Secure certificate issuance

🌐 Decentralized and tamper-proof verification

⛓️ Ethereum smart contract integration

📦 IPFS-based certificate storage

🦊 MetaMask wallet support

🛡️ Admin-restricted certificate issuance

🛠️ Tech Stack

Frontend

⚛️ React (Vite)

📜 JavaScript

🎨 Tailwind CSS

Blockchain

⛓️ Ethereum

🧠 Solidity

🛠️ Hardhat

Storage

☁️ IPFS (Pinata)

Wallet

🦊 MetaMask

🗄️ Database Used

This project does not use a traditional database like MySQL or MongoDB.

📌 Blockchain (Ethereum) is used to store certificate hashes permanently

☁️ IPFS is used to store certificate files and metadata

🧠 This approach removes the need for centralized databases and improves security

If needed in the future, a database such as MongoDB can be added for:

User management
Audit logs
Issuer records

📂 Project Structure
Blockchain-Certificate-System/
├── backend/
│   ├── contracts/
│   ├── scripts/
│   └── test/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── utils/
└── README.md

▶️ How to Run the Project

✅ Prerequisites

Node.js (v16 or above)
MetaMask browser extension
Ethereum test network account (Sepolia or Localhost)
Pinata IPFS account (for API keys)

🔧 Backend Setup (Smart Contracts)

cd backend

npm install

npx hardhat compile

npx hardhat test

(Optional: Run local blockchain)

npx hardhat node

npx hardhat run scripts/deploy.js --network localhost


🖥️ Frontend Setup

cd frontend

npm install

npm run dev



Open your browser at:

http://localhost:5173


Connect MetaMask to the correct Ethereum network.

🔐 Security Notes

🔑 Only cryptographic hashes are stored on-chain

🚫 No sensitive certificate data is saved on the blockchain

⛓️ Blockchain immutability ensures certificate integrity

🚀 Future Improvements

🏫 Support for multiple issuing authorities

📱 QR code-based certificate verification

🔐 Enhanced access control

🌍 Mainnet deployment

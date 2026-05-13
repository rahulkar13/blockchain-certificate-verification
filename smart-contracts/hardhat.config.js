require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

const networks = {
  hardhat: {},
};

if (process.env.SEPOLIA_RPC_URL) {
  networks.sepolia = {
    url: process.env.SEPOLIA_RPC_URL,
    chainId: 11155111,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  };
}

module.exports = {
  solidity: "0.8.20",
  networks,
};

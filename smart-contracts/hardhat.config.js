require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    ganache: {
      url: process.env.GANACHE_URL || "http://127.0.0.1:7545",
      chainId: Number(process.env.GANACHE_CHAIN_ID || 1337),
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};

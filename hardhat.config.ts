import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import 'hardhat-deploy'
import 'dotenv/config'

export const config: HardhatUserConfig = {
  namedAccounts: {
    deployer: {
      default: 0, // First account is taken as deployer
    },
  },
  networks: {
    localhost: {
      chainId: 31337,
    },
    maticmum: {
      chainId: 80001,
      url: process.env.MUMBAI_RPC_URL || '',
      accounts: { mnemonic: process.env.MNEMONIC || '' },
    },
  },
  etherscan: {
    apiKey: {
      polygon: process.env.POLYGON_SCAN_API_KEY || '',
      polygonMumbai: process.env.POLYGON_SCAN_API_KEY || '',
      goerli: process.env.ETHERSCAN_API_KEY || '',
    },
  },
  solidity: {
    version: '0.8.13',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: 'london',
    },
  },
  typechain: {
    outDir: 'typechain',
  },
  paths: {
    sources: './src', // Use ./src rather than ./contracts as Hardhat expects
    cache: './cache_hardhat', // Use a different cache for Hardhat than Foundry
  },
};

export default config;

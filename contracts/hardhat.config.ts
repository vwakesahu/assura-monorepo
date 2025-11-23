import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL || configVariable("SEPOLIA_RPC_URL"),
      accounts: process.env.SEPOLIA_PRIVATE_KEY 
        ? [process.env.SEPOLIA_PRIVATE_KEY] 
        : [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    baseSepolia: {
      type: "http",
      chainType: "generic",
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.BASE_SEPOLIA_PRIVATE_KEY
        ? [process.env.BASE_SEPOLIA_PRIVATE_KEY]
        : process.env.PRIVATE_KEY
          ? [process.env.PRIVATE_KEY]
          : [],
    },
  },
});

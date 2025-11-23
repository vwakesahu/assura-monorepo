import { baseSepolia } from "viem/chains";

export const currentChain = baseSepolia;

// TEE Service URL - can be overridden via NEXT_PUBLIC_TEE_SERVICE_URL environment variable
export const TEE_SERVICE_URL = "https://tee.assura.network";

// Contract addresses (update these with your deployed contract addresses)
export const CONTRACT_ADDRESSES = {
  // AssuraVerifier deployed address
  ASSURA_VERIFIER:
    "0x620729dd38e3c7c818a9635243e9648f6be04b2d" as `0x${string}`,
  // AssuraProtectedVault deployed address
  VAULT: "0xf2ec5620a16f747c1adfabf8d26995d24468493a" as `0x${string}`,
} as const;

// Image paths
export const IMAGE_PATHS = {
  chains: {
    baseSepolia: "/images/chains/base.jpeg",
  },
  tokens: {
    usdc: "/images/tokens/usdc.png",
    usdt: "/images/tokens/usdt.png",
    dai: "/images/tokens/dai.png",
  },
} as const;

// Token configurations
export const TOKENS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    image: IMAGE_PATHS.tokens.usdc,
    available: true,
    // address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
    address: "0xa92d0a2842c27cf97b51aae37ff29b7e65d8e855", // MOCK USDC
    decimals: 6,
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    image: IMAGE_PATHS.tokens.usdt,
    available: false,
    comingSoon: true,
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin",
    image: IMAGE_PATHS.tokens.dai,
    available: false,
    comingSoon: true,
  },
] as const;

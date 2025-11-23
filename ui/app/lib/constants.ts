import { baseSepolia } from "viem/chains";

export const currentChain = baseSepolia;

// TEE Service URL - can be overridden via NEXT_PUBLIC_TEE_SERVICE_URL environment variable
export const TEE_SERVICE_URL = "https://tee.assura.network";

// Contract addresses (update these with your deployed contract addresses)
export const CONTRACT_ADDRESSES = {
  // AssuraVerifier deployed address
  ASSURA_VERIFIER:
    "0xab9f034111017a5e9ad454848059df1752b8c0dc" as `0x${string}`,
  // AssuraProtectedVault deployed address
  VAULT: "0x836ce296438bdf70d94a08fc6663ef5203178546" as `0x${string}`,
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
    address: "0xbb1e663898dd0212ec005def1d4ef98df3e914a0", // MOCK USDC
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

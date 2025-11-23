import { baseSepolia } from "viem/chains";

export const currentChain = baseSepolia;

// TEE Service URL - can be overridden via NEXT_PUBLIC_TEE_SERVICE_URL environment variable
export const TEE_SERVICE_URL = 'https://tee.assura.network';

// Contract addresses (update these with your deployed contract addresses)
export const CONTRACT_ADDRESSES = {
  // AssuraVerifier deployed address
  ASSURA_VERIFIER:
    "0x127a6e6c3922e7619cce2899588ba3220637ceac" as `0x${string}`,
  // AssuraProtectedVault deployed address
  VAULT: "0xf1e3d42bbd65097fe49c62a6600976edd6b797f5" as `0x${string}`,
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
    address: "0x7a783231c6749f803b2f56a0a106e303cc677e0d", // MOCK USDC
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

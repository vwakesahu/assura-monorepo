import { baseSepolia } from "viem/chains";

export const currentChain = baseSepolia;

// TEE Service URL - can be overridden via NEXT_PUBLIC_TEE_SERVICE_URL environment variable
export const TEE_SERVICE_URL = "https://tee.assura.network";

// Contract addresses (update these with your deployed contract addresses)
export const CONTRACT_ADDRESSES = {
  // AssuraVerifier deployed address
  ASSURA_VERIFIER:
    "0xf4e351d9ed83b5516b82c044b0e5ee570154010d" as `0x${string}`,
  // AssuraProtectedVault deployed address
  VAULT: "0x94f5dbb0286532f3fd05bc578b7edd6b9b793646" as `0x${string}`,
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
    address: "0x222103b1c3414c70b767f5630fb332a8e1297887", // MOCK USDC
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

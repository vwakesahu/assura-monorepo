import { baseSepolia } from "viem/chains";

export const currentChain = baseSepolia;

// TEE Service URL - can be overridden via NEXT_PUBLIC_TEE_SERVICE_URL environment variable
export const TEE_SERVICE_URL = "https://tee.assura.network";

// Contract addresses (update these with your deployed contract addresses)
export const CONTRACT_ADDRESSES = {
  // AssuraVerifier deployed address
  ASSURA_VERIFIER:
    "0xBfA2740a2F9e9d0931F1F7c4346dd44911Fc15a4" as `0x${string}`,
  // AssuraProtectedVault deployed address
  VAULT: "0x70c3e38fd09ba816506536cf345f4fb7058b5c47" as `0x${string}`,
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
    address: "0x9eb859b62a579259d5c5db687abdae3b67426dc2", // MOCK USDC
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

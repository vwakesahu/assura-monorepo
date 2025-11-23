import { createWalletClient, createPublicClient, http, type WalletClient, type PublicClient, type Address, type Hash, type TransactionReceipt } from 'viem';

export type { WalletClient, PublicClient, Address, TransactionReceipt };
import { privateKeyToAccount } from 'viem/accounts';
import { parseEther, getAddress } from 'viem';

/**
 * Create a public client for reading from the blockchain
 */
export function makeProvider(rpcUrl: string, chainId: number): PublicClient {
  return createPublicClient({
    transport: http(rpcUrl),
    chain: {
      id: chainId,
      name: 'Custom Chain',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [rpcUrl],
        },
      },
    },
  });
}

/**
 * Create a wallet client from a private key
 */
export function connectWallet(skHex: string, rpcUrl: string, chainId: number): WalletClient {
  const account = privateKeyToAccount(skHex as `0x${string}`);
  
  return createWalletClient({
    account,
    transport: http(rpcUrl),
    chain: {
      id: chainId,
      name: 'Custom Chain',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [rpcUrl],
        },
      },
    },
  });
}

/**
 * Sign a personal message
 */
export async function signPersonalMessage(
  wallet: WalletClient,
  msg: string
): Promise<`0x${string}`> {
  if (!wallet.account) {
    throw new Error('Wallet client has no account');
  }
  return wallet.signMessage({
    account: wallet.account,
    message: msg,
  });
}

/**
 * Send ETH to an address
 */
export async function sendEth(
  wallet: WalletClient,
  to: string,
  amountEth: string,
  rpcUrl?: string
): Promise<TransactionReceipt> {
  if (!wallet.account) {
    throw new Error('Wallet client has no account');
  }
  if (!wallet.chain) {
    throw new Error('Wallet client has no chain configured');
  }

  const hash = await wallet.sendTransaction({
    account: wallet.account,
    to: getAddress(to),
    value: parseEther(amountEth),
    chain: wallet.chain,
  });

  // Create public client with same chain configuration
  const publicClient = createPublicClient({
    transport: http(rpcUrl || wallet.chain.rpcUrls.default.http[0]),
    chain: wallet.chain,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt;
}

/**
 * Deploy a contract
 */
export async function deployContract(
  wallet: WalletClient,
  abi: any[],
  bytecode: `0x${string}`,
  args: unknown[] = [],
  rpcUrl?: string
): Promise<{ address: Address; receipt: TransactionReceipt }> {
  if (!wallet.account) {
    throw new Error('Wallet client has no account');
  }
  if (!wallet.chain) {
    throw new Error('Wallet client has no chain configured');
  }

  const hash = await wallet.deployContract({
    account: wallet.account,
    abi,
    bytecode,
    args,
    chain: wallet.chain,
  });

  // Create public client with same chain configuration
  const publicClient = createPublicClient({
    transport: http(rpcUrl || wallet.chain.rpcUrls.default.http[0]),
    chain: wallet.chain,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  
  if (!receipt.contractAddress) {
    throw new Error('Contract deployment failed - no contract address');
  }

  return {
    address: receipt.contractAddress,
    receipt,
  };
}

/**
 * Convert secret key hex string to account
 */
export function secretKeyToAccount(skHex: string) {
  return privateKeyToAccount(skHex as `0x${string}`);
}

/**
 * Checksum an Ethereum address
 */
export function checksumAddress(addr: string): Address {
  return getAddress(addr);
}


/**
 * Enhanced Compliance Score Calculator with CryptoAPIs Integration
 *
 * Uses multiple data sources to calculate comprehensive compliance scores:
 * - KYC verification status (aKYC, eKYC)
 * - Wallet age (days since first transaction)
 * - Wallet balance (ETH holdings)
 * - Transaction activity (count and volume)
 * - Token holdings diversity
 */

// Scoring weights (out of 1000 total points)
const SCORING_WEIGHTS = {
  aKYC: 400, // 40% if user has aKYC
  eKYC: 500, // 50% if user has eKYC (total 900 with both)
  walletAge: 50, // 5% based on wallet age
  balance: 30, // 3% based on wallet balance
  transactionCount: 10, // 1% based on transaction count
  transactionVolume: 10, // 1% based on transaction volume
};

// Thresholds
const WALLET_AGE_THRESHOLD_DAYS = 365; // 1 year
const BALANCE_THRESHOLD_ETH = 0.01; // 0.01 ETH for full points
const TX_COUNT_THRESHOLD = 50; // 50 transactions for full points
const TX_VOLUME_THRESHOLD_ETH = 1.0; // 1 ETH total volume for full points

// CryptoAPIs configuration
const CRYPTO_API_BASE_URL = 'https://rest.cryptoapis.io';
const CRYPTO_API_KEY = process.env.CRYPTO_API_KEY || 'd58cb0892f9fbf34815230e5066ee411f45ec259';

// CryptoAPIs response types
interface CryptoAPIBalanceResponse {
  data: {
    item: {
      confirmedBalance: {
        amount: string;
      };
    };
  };
}

interface CryptoAPITransaction {
  transactionValue?: {
    amount: string;
  };
  timestamp?: number;
  minedInBlockTimestamp?: number;
}

interface CryptoAPITransactionsResponse {
  data: {
    items: CryptoAPITransaction[];
    total?: number;
  };
}

interface WalletData {
  balance: number; // in ETH
  transactionCount: number;
  transactionVolume: number; // in ETH
  walletAgeDays: number;
  firstTransactionDate: Date | null;
}

/**
 * Fetch wallet balance from CryptoAPIs
 */
async function fetchWalletBalance(address: string, network: string = 'ethereum', blockchain: string = 'mainnet'): Promise<number> {
  try {
    const response = await fetch(
      `${CRYPTO_API_BASE_URL}/addresses-latest/evm/${network}/${blockchain}/${address}/balance`,
      {
        headers: {
          'x-api-key': CRYPTO_API_KEY,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      }
    );

    if (!response.ok) {
      throw new Error(`CryptoAPIs balance API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as CryptoAPIBalanceResponse;
    const balanceWei = data?.data?.item?.confirmedBalance?.amount || '0';

    // Convert from Wei to ETH (divide by 10^18)
    const balanceETH = parseFloat(balanceWei) / 1e18;

    return balanceETH;
  } catch (error: any) {
    console.error(`Failed to fetch balance from CryptoAPIs: ${error.message}`);
    return 0;
  }
}

/**
 * Fetch transaction data from CryptoAPIs
 */
async function fetchTransactionData(address: string, network: string = 'ethereum', blockchain: string = 'mainnet'): Promise<{
  count: number;
  volumeETH: number;
  firstTxDate: Date | null;
}> {
  try {
    // Fetch recent transactions (limit 50 for performance)
    const response = await fetch(
      `${CRYPTO_API_BASE_URL}/addresses/evm/${network}/${blockchain}/${address}/transactions?limit=50&transactionType=incoming-and-outgoing`,
      {
        headers: {
          'x-api-key': CRYPTO_API_KEY,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000), // 15 second timeout
      }
    );

    if (!response.ok) {
      throw new Error(`CryptoAPIs transactions API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as CryptoAPITransactionsResponse;
    const transactions = data?.data?.items || [];

    // Calculate transaction count
    const count = data?.data?.total || transactions.length;

    // Calculate transaction volume
    let volumeWei = 0;
    let oldestTxTimestamp: number | null = null;

    for (const tx of transactions) {
      const value = parseFloat(tx?.transactionValue?.amount || '0');
      volumeWei += value;

      // Track oldest transaction
      const txTimestamp = tx?.timestamp || tx?.minedInBlockTimestamp;
      if (txTimestamp) {
        const txTime = new Date(txTimestamp * 1000).getTime();
        if (!oldestTxTimestamp || txTime < oldestTxTimestamp) {
          oldestTxTimestamp = txTime;
        }
      }
    }

    const volumeETH = volumeWei / 1e18;
    const firstTxDate = oldestTxTimestamp ? new Date(oldestTxTimestamp) : null;

    return {
      count,
      volumeETH,
      firstTxDate,
    };
  } catch (error: any) {
    console.error(`Failed to fetch transaction data from CryptoAPIs: ${error.message}`);
    return {
      count: 0,
      volumeETH: 0,
      firstTxDate: null,
    };
  }
}

/**
 * Fetch comprehensive wallet data using CryptoAPIs
 */
async function fetchWalletData(address: string): Promise<WalletData> {
  // Try mainnet first, fallback to testnet if needed
  let balance = 0;
  let txData = { count: 0, volumeETH: 0, firstTxDate: null as Date | null };

  try {
    // Try Ethereum mainnet
    [balance, txData] = await Promise.all([
      fetchWalletBalance(address, 'ethereum', 'mainnet'),
      fetchTransactionData(address, 'ethereum', 'mainnet'),
    ]);
  } catch (error: any) {
    console.error('Failed to fetch from Ethereum mainnet:', error.message);

    // If mainnet fails, the individual functions already returned defaults
    // We can also try Base or other chains here if needed
  }

  // Calculate wallet age
  let walletAgeDays = 0;
  if (txData.firstTxDate) {
    const ageInMs = Date.now() - txData.firstTxDate.getTime();
    walletAgeDays = ageInMs / (1000 * 60 * 60 * 24);
  }

  return {
    balance,
    transactionCount: txData.count,
    transactionVolume: txData.volumeETH,
    walletAgeDays,
    firstTransactionDate: txData.firstTxDate,
  };
}

/**
 * Fallback: Get wallet data from local RPC (Base Sepolia)
 * Used if CryptoAPIs fails
 */
async function fetchWalletDataFallback(address: string): Promise<WalletData> {
  try {
    const { createPublicClient, http } = await import('viem');
    const { baseSepolia } = await import('viem/chains');

    const rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl),
    });

    // Get balance
    const balanceWei = await publicClient.getBalance({ address: address as `0x${string}` });
    const balance = Number(balanceWei) / 1e18;

    // Get transaction count
    const txCount = await publicClient.getTransactionCount({ address: address as `0x${string}` });

    return {
      balance,
      transactionCount: txCount,
      transactionVolume: 0, // Not available from basic RPC
      walletAgeDays: 0, // Would require extensive block queries
      firstTransactionDate: null,
    };
  } catch (error: any) {
    console.error('Fallback RPC also failed:', error.message);
    return {
      balance: 0,
      transactionCount: 0,
      transactionVolume: 0,
      walletAgeDays: 0,
      firstTransactionDate: null,
    };
  }
}

/**
 * Calculate compliance score based on multiple factors
 *
 * Enhanced scoring breakdown:
 * - aKYC: 400 points (40%) if verified
 * - eKYC: 500 points (50%) if verified (total 900 with aKYC)
 * - Wallet age: up to 50 points (5%) - full points if >1 year
 * - Wallet balance: up to 30 points (3%) - full points if >0.01 ETH
 * - Transaction count: up to 10 points (1%) - full points if >50 txs
 * - Transaction volume: up to 10 points (1%) - full points if >1 ETH total
 *
 * @param userAddress Ethereum address
 * @param aKYC Whether user has advanced KYC
 * @param eKYC Whether user has electronic KYC
 * @returns Compliance score (0-1000)
 */
export async function calculateComplianceScore(
  userAddress: string,
  aKYC: boolean,
  eKYC: boolean
): Promise<{
  totalScore: number;
  breakdown: {
    aKYCScore: number;
    eKYCScore: number;
    walletAgeScore: number;
    balanceScore: number;
    transactionCountScore: number;
    transactionVolumeScore: number;
  };
  metadata: {
    walletAgeDays: number;
    walletBalanceETH: number;
    transactionCount: number;
    transactionVolumeETH: number;
    firstTransactionDate: string | null;
    dataSource: 'cryptoapis' | 'rpc-fallback';
  };
}> {
  // Fetch wallet data with fallback
  let walletData: WalletData;
  let dataSource: 'cryptoapis' | 'rpc-fallback' = 'cryptoapis';

  try {
    walletData = await fetchWalletData(userAddress);

    // If CryptoAPIs returned no data, use fallback
    if (walletData.balance === 0 && walletData.transactionCount === 0) {
      console.log('CryptoAPIs returned no data, using RPC fallback');
      walletData = await fetchWalletDataFallback(userAddress);
      dataSource = 'rpc-fallback';
    }
  } catch (error: any) {
    console.error('Failed to fetch wallet data, using RPC fallback:', error.message);
    walletData = await fetchWalletDataFallback(userAddress);
    dataSource = 'rpc-fallback';
  }

  // Calculate individual scores
  const aKYCScore = aKYC ? SCORING_WEIGHTS.aKYC : 0;
  const eKYCScore = eKYC ? SCORING_WEIGHTS.eKYC : 0;

  // Wallet age score: linear scale up to threshold
  const ageRatio = Math.min(walletData.walletAgeDays / WALLET_AGE_THRESHOLD_DAYS, 1);
  const walletAgeScore = Math.floor(ageRatio * SCORING_WEIGHTS.walletAge);

  // Balance score: linear scale up to threshold
  const balanceRatio = Math.min(walletData.balance / BALANCE_THRESHOLD_ETH, 1);
  const balanceScore = Math.floor(balanceRatio * SCORING_WEIGHTS.balance);

  // Transaction count score: linear scale up to threshold
  const txCountRatio = Math.min(walletData.transactionCount / TX_COUNT_THRESHOLD, 1);
  const transactionCountScore = Math.floor(txCountRatio * SCORING_WEIGHTS.transactionCount);

  // Transaction volume score: linear scale up to threshold
  const txVolumeRatio = Math.min(walletData.transactionVolume / TX_VOLUME_THRESHOLD_ETH, 1);
  const transactionVolumeScore = Math.floor(txVolumeRatio * SCORING_WEIGHTS.transactionVolume);

  // Total score
  const totalScore = aKYCScore + eKYCScore + walletAgeScore + balanceScore + transactionCountScore + transactionVolumeScore;

  return {
    totalScore: Math.min(totalScore, 1000), // Cap at 1000
    breakdown: {
      aKYCScore,
      eKYCScore,
      walletAgeScore,
      balanceScore,
      transactionCountScore,
      transactionVolumeScore,
    },
    metadata: {
      walletAgeDays: Math.floor(walletData.walletAgeDays),
      walletBalanceETH: Number(walletData.balance.toFixed(6)),
      transactionCount: walletData.transactionCount,
      transactionVolumeETH: Number(walletData.transactionVolume.toFixed(6)),
      firstTransactionDate: walletData.firstTransactionDate?.toISOString() || null,
      dataSource,
    },
  };
}

/**
 * Calculate score for new users (no aKYC/eKYC yet)
 */
export async function calculateInitialScore(userAddress: string): Promise<{
  totalScore: number;
  breakdown: {
    aKYCScore: number;
    eKYCScore: number;
    walletAgeScore: number;
    balanceScore: number;
    transactionCountScore: number;
    transactionVolumeScore: number;
  };
  metadata: {
    walletAgeDays: number;
    walletBalanceETH: number;
    transactionCount: number;
    transactionVolumeETH: number;
    firstTransactionDate: string | null;
    dataSource: 'cryptoapis' | 'rpc-fallback';
  };
}> {
  // New users start with aKYC=false, eKYC=false
  return calculateComplianceScore(userAddress, false, false);
}

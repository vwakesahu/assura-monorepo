import { createOffchainClient, type ChainName } from '@thenamespace/offchain-manager';

let client: ReturnType<typeof createOffchainClient> | null = null;

/**
 * Initialize the Namespace Offchain Manager client
 */
export function initializeOffchainManager() {
  try {
    const API_KEY = process.env.NAMESPACE_API_KEY;
    const NETWORK = (process.env.NAMESPACE_NETWORK || 'mainnet') as 'mainnet' | 'sepolia';

    if (!API_KEY) {
      console.warn('⚠️  NAMESPACE_API_KEY not set. Subname features will not work.');
      return;
    }

    client = createOffchainClient({
      mode: NETWORK,
      timeout: 5000,
      defaultApiKey: API_KEY,
    });

    console.log(`✅ Namespace Offchain Manager initialized (${NETWORK})`);
  } catch (error: any) {
    console.error('❌ Failed to initialize Namespace Offchain Manager:', error.message);
  }
}

/**
 * Get the initialized client
 */
function getClient() {
  if (!client) {
    throw new Error('Namespace Offchain Manager not initialized. Set NAMESPACE_API_KEY environment variable.');
  }
  return client;
}

/**
 * Check if a subname is available
 */
export async function checkSubnameAvailability(
  label: string,
  parentName: string
): Promise<boolean> {
  const fullName = `${label}.${parentName}`;
  const result = await getClient().isSubnameAvailable(fullName);
  return result.isAvailable;
}

/**
 * Get a specific subname
 */
export async function getSubname(label: string, parentName: string) {
  try {
    const fullName = `${label}.${parentName}`;
    const page = await getClient().getFilteredSubnames({
      parentName,
      labelSearch: label,
      page: 1,
      size: 1,
    });
    
    return page.items.find((item) => item.fullName === fullName) || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get filtered subnames
 */
export async function getSubnames(
  parentName: string,
  options: {
    owner?: string;
    labelSearch?: string;
    page?: number;
    size?: number;
  } = {}
) {
  const { owner, labelSearch, page = 1, size = 10 } = options;
  
  return getClient().getFilteredSubnames({
    parentName,
    owner,
    labelSearch,
    page,
    size,
  });
}

/**
 * Create a subname
 */
export async function createSubname(params: {
  label: string;
  parentName: string;
  owner?: string;
  texts?: Array<{ key: string; value: string }>;
  addresses?: Array<{ chain: ChainName; value: string }>;
  metadata?: Array<{ key: string; value: string }>;
}) {
  const { label, parentName, owner, texts, addresses, metadata } = params;
  
  await getClient().createSubname({
    label,
    parentName,
    texts,
    addresses,
    owner,
    metadata,
  });

  // Return the created subname
  return getSubname(label, parentName);
}

/**
 * Get all text records for a subname
 */
export async function getTextRecords(label: string, parentName: string) {
  const fullName = `${label}.${parentName}`;
  return getClient().getTextRecords(fullName);
}

/**
 * Get a specific text record for a subname
 */
export async function getTextRecord(
  label: string,
  parentName: string,
  key: string
): Promise<string | null> {
  try {
    const fullName = `${label}.${parentName}`;
    const result = await getClient().getTextRecord(fullName, key);
    return result.record || null;
  } catch (error) {
    return null;
  }
}

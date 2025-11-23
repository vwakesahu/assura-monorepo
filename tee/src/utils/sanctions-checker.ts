import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface SanctionedAddress {
  address: string;
  entity: string;
  source: string;
  addedAt: string;
}

interface SanctionsMetadata {
  updatedAt: string;
  totalAddresses: number;
}

interface SanctionsData {
  [address: string]: SanctionedAddress | SanctionsMetadata;
}

const SANCTIONS_URL = 'https://raw.githubusercontent.com/Assura-Network/assura-monorepo/main/tee/scrapper/sanctioned-addresses.json';
const CACHE_DIR = process.env.TEE_STORAGE_DIR || '/data/tee';
const CACHE_FILE = join(CACHE_DIR, 'sanctioned-addresses.json');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

let sanctionsCache: SanctionsData | null = null;
let lastFetchTime = 0;

/**
 * Ensure cache directory exists
 */
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Load sanctions from cache file
 */
function loadFromCache(): SanctionsData | null {
  ensureCacheDir();

  if (!existsSync(CACHE_FILE)) {
    return null;
  }

  try {
    const data = readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(data) as SanctionsData;
  } catch (error) {
    console.error('Failed to load sanctions cache:', error);
    return null;
  }
}

/**
 * Save sanctions to cache file
 */
function saveToCache(data: SanctionsData): void {
  ensureCacheDir();

  try {
    writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save sanctions cache:', error);
  }
}

/**
 * Fetch sanctions list from GitHub
 */
async function fetchSanctionsList(): Promise<SanctionsData> {
  try {
    const response = await fetch(SANCTIONS_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch sanctions list: ${response.statusText}`);
    }

    const data = await response.json() as SanctionsData;

    // Save to cache
    saveToCache(data);

    return data;
  } catch (error: any) {
    console.error('Failed to fetch sanctions list from GitHub:', error.message);

    // Try to load from cache as fallback
    const cached = loadFromCache();
    if (cached) {
      console.log('⚠️  Using cached sanctions list (fetch failed)');
      return cached;
    }

    throw new Error('Failed to load sanctions list and no cache available');
  }
}

/**
 * Get sanctions list (with caching)
 */
async function getSanctionsList(): Promise<SanctionsData> {
  const now = Date.now();

  // Check if cache is valid
  if (sanctionsCache && (now - lastFetchTime) < CACHE_TTL) {
    return sanctionsCache;
  }

  // Try to fetch fresh data
  try {
    sanctionsCache = await fetchSanctionsList();
    lastFetchTime = now;
    return sanctionsCache;
  } catch (error) {
    // If fetch fails and we have no cache, try loading from disk one more time
    if (!sanctionsCache) {
      const cached = loadFromCache();
      if (cached) {
        sanctionsCache = cached;
        lastFetchTime = now;
        return sanctionsCache;
      }
    }

    throw error;
  }
}

/**
 * Check if an address is sanctioned
 * @param address Ethereum address to check
 * @returns Sanctioned entity info if found, null otherwise
 */
export async function isSanctioned(address: string): Promise<SanctionedAddress | null> {
  try {
    const sanctionsList = await getSanctionsList();

    // Normalize address to lowercase for comparison
    const normalizedAddress = address.toLowerCase();

    // Check if address is in sanctions list
    const entry = sanctionsList[normalizedAddress];
    if (entry && 'address' in entry) {
      return entry as SanctionedAddress;
    }

    return null;
  } catch (error: any) {
    console.error('Error checking sanctions:', error.message);
    // In case of error, allow the address (fail open for availability)
    // but log the error for monitoring
    return null;
  }
}

/**
 * Get sanctions list statistics
 */
export async function getSanctionsStats() {
  try {
    const sanctionsList = await getSanctionsList();
    const metadata = sanctionsList._metadata as SanctionsMetadata | undefined;
    return {
      totalSanctioned: metadata?.totalAddresses || Object.keys(sanctionsList).filter(k => k !== '_metadata').length,
      lastUpdated: metadata?.updatedAt || 'unknown',
      cacheAge: Date.now() - lastFetchTime,
    };
  } catch (error: any) {
    return {
      error: error.message,
      totalSanctioned: 0,
      lastUpdated: 'unknown',
      cacheAge: 0,
    };
  }
}

/**
 * Force refresh sanctions list
 */
export async function refreshSanctionsList(): Promise<void> {
  sanctionsCache = await fetchSanctionsList();
  lastFetchTime = Date.now();
}

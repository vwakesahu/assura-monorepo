import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface UserAttestation {
  userAddress: string;
  score: number;
  timestamp: number;
  chainId: number;
  signature: string;
  teeAddress: string;
  username?: string; // ENS username (if registered)
  eKYC?: boolean;
  aKYC?: boolean;
}

interface UserProfile {
  userAddress: string;
  username: string;
  ensFullName: string;
  score: number;
  eKYC: boolean;
  aKYC: boolean;
  registeredAt: number;
  lastAttestationAt: number;
}

interface UserStorage {
  attestations: Record<string, UserAttestation[]>; // userAddress -> attestations[]
  profiles: Record<string, UserProfile>; // username -> profile
  addressToUsername: Record<string, string>; // address -> username mapping
  metadata: {
    totalAttestations: number;
    totalProfiles: number;
    lastUpdated: number;
  };
}

const STORAGE_DIR = process.env.TEE_STORAGE_DIR || '/data/tee';
const STORAGE_FILE = join(STORAGE_DIR, 'user-attestations.json');

/**
 * Initialize storage directory
 */
function ensureStorageDir() {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

/**
 * Load user storage from disk
 */
export function loadUserStorage(): UserStorage {
  ensureStorageDir();

  if (!existsSync(STORAGE_FILE)) {
    return {
      attestations: {},
      profiles: {},
      addressToUsername: {},
      metadata: {
        totalAttestations: 0,
        totalProfiles: 0,
        lastUpdated: Date.now(),
      },
    };
  }

  try {
    const data = readFileSync(STORAGE_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    // Migrate old storage format if needed
    if (!parsed.profiles) parsed.profiles = {};
    if (!parsed.addressToUsername) parsed.addressToUsername = {};
    if (!parsed.metadata.totalProfiles) parsed.metadata.totalProfiles = 0;
    return parsed;
  } catch (error) {
    console.error('Failed to load user storage:', error);
    return {
      attestations: {},
      profiles: {},
      addressToUsername: {},
      metadata: {
        totalAttestations: 0,
        totalProfiles: 0,
        lastUpdated: Date.now(),
      },
    };
  }
}

/**
 * Save user storage to disk
 */
export function saveUserStorage(storage: UserStorage): void {
  ensureStorageDir();

  try {
    storage.metadata.lastUpdated = Date.now();
    writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save user storage:', error);
  }
}

/**
 * Add attestation record for a user
 */
export function addUserAttestation(attestation: UserAttestation): void {
  const storage = loadUserStorage();

  const userAddr = attestation.userAddress.toLowerCase();

  if (!storage.attestations[userAddr]) {
    storage.attestations[userAddr] = [];
  }

  storage.attestations[userAddr].push(attestation);
  storage.metadata.totalAttestations++;

  saveUserStorage(storage);
}

/**
 * Get attestation history for a user
 */
export function getUserAttestations(userAddress: string): UserAttestation[] {
  const storage = loadUserStorage();
  const userAddr = userAddress.toLowerCase();
  return storage.attestations[userAddr] || [];
}

/**
 * Get user's latest attestation
 */
export function getLatestUserAttestation(userAddress: string): UserAttestation | null {
  const attestations = getUserAttestations(userAddress);
  if (attestations.length === 0) return null;
  return attestations[attestations.length - 1];
}

/**
 * Get all users with attestations
 */
export function getAllUsers(): string[] {
  const storage = loadUserStorage();
  return Object.keys(storage.attestations);
}

/**
 * Get storage statistics
 */
export function getStorageStats() {
  const storage = loadUserStorage();
  return {
    totalUsers: Object.keys(storage.attestations).length,
    totalProfiles: storage.metadata.totalProfiles,
    totalAttestations: storage.metadata.totalAttestations,
    lastUpdated: new Date(storage.metadata.lastUpdated).toISOString(),
  };
}

/**
 * Register a user profile with ENS username
 */
export function registerUserProfile(profile: UserProfile): void {
  const storage = loadUserStorage();

  const usernameLower = profile.username.toLowerCase();
  const addressLower = profile.userAddress.toLowerCase();

  // Check if username is already taken
  if (storage.profiles[usernameLower]) {
    throw new Error(`Username "${profile.username}" is already registered`);
  }

  // Check if address already has a username
  if (storage.addressToUsername[addressLower]) {
    throw new Error(
      `Address ${profile.userAddress} is already registered with username "${storage.addressToUsername[addressLower]}"`
    );
  }

  // Register profile
  storage.profiles[usernameLower] = profile;
  storage.addressToUsername[addressLower] = usernameLower;
  storage.metadata.totalProfiles++;

  saveUserStorage(storage);
}

/**
 * Get user profile by username
 */
export function getUserProfile(username: string): UserProfile | null {
  const storage = loadUserStorage();
  return storage.profiles[username.toLowerCase()] || null;
}

/**
 * Get user profile by address
 */
export function getUserProfileByAddress(userAddress: string): UserProfile | null {
  const storage = loadUserStorage();
  const username = storage.addressToUsername[userAddress.toLowerCase()];
  if (!username) return null;
  return storage.profiles[username] || null;
}

/**
 * Update user profile (score, eKYC, aKYC)
 */
export function updateUserProfile(
  username: string,
  updates: Partial<Pick<UserProfile, 'score' | 'eKYC' | 'aKYC' | 'lastAttestationAt'>>
): void {
  const storage = loadUserStorage();
  const usernameLower = username.toLowerCase();

  const profile = storage.profiles[usernameLower];
  if (!profile) {
    throw new Error(`Profile not found for username "${username}"`);
  }

  // Update fields
  Object.assign(profile, updates);

  saveUserStorage(storage);
}

/**
 * Check if username is available
 */
export function isUsernameAvailable(username: string): boolean {
  const storage = loadUserStorage();
  return !storage.profiles[username.toLowerCase()];
}

/**
 * Check if address has a registered username
 */
export function hasRegisteredUsername(userAddress: string): boolean {
  const storage = loadUserStorage();
  return !!storage.addressToUsername[userAddress.toLowerCase()];
}

/**
 * Get all profiles
 */
export function getAllProfiles(): UserProfile[] {
  const storage = loadUserStorage();
  return Object.values(storage.profiles);
}

/**
 * Delete a user profile and all associated data
 * @param username The username to delete
 * @returns The deleted profile, or null if not found
 */
export function deleteUserProfile(username: string): UserProfile | null {
  const storage = loadUserStorage();
  const usernameLower = username.toLowerCase();

  const profile = storage.profiles[usernameLower];
  if (!profile) {
    return null;
  }

  const addressLower = profile.userAddress.toLowerCase();

  // Delete profile
  delete storage.profiles[usernameLower];

  // Delete address mapping
  delete storage.addressToUsername[addressLower];

  // Delete all attestations for this user
  if (storage.attestations[addressLower]) {
    const attestationCount = storage.attestations[addressLower].length;
    delete storage.attestations[addressLower];
    storage.metadata.totalAttestations -= attestationCount;
  }

  // Update metadata
  storage.metadata.totalProfiles--;

  saveUserStorage(storage);

  return profile;
}

/**
 * Delete user by address
 * @param userAddress The user address to delete
 * @returns The deleted profile, or null if not found
 */
export function deleteUserByAddress(userAddress: string): UserProfile | null {
  const storage = loadUserStorage();
  const addressLower = userAddress.toLowerCase();

  const username = storage.addressToUsername[addressLower];
  if (!username) {
    return null;
  }

  return deleteUserProfile(username);
}

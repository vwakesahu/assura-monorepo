import 'dotenv/config';
import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getTeePrivateKey, isTeeEnvironment } from './utils/tee-keys';
import { connectWallet, secretKeyToAccount, checksumAddress, signPersonalMessage, type WalletClient } from './utils/wallet';
import type { Address } from 'viem';
import { ChainName } from '@thenamespace/offchain-manager';
import {
  initializeOffchainManager,
  checkSubnameAvailability,
  getSubname,
  getSubnames,
  createSubname,
  getTextRecords,
  getTextRecord,
} from './utils/subname-manager';
import {
  addUserAttestation,
  getUserAttestations,
  getLatestUserAttestation,
  getAllUsers,
  getStorageStats,
  registerUserProfile,
  getUserProfile,
  getUserProfileByAddress,
  updateUserProfile,
  isUsernameAvailable,
  hasRegisteredUsername,
  getAllProfiles,
} from './utils/user-storage';
import { isSanctioned, getSanctionsStats, refreshSanctionsList } from './utils/sanctions-checker';
import { calculateInitialScore, calculateComplianceScore } from './utils/score-calculator';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// TEE Wallet initialization
let teeWallet: WalletClient | null = null;
let teeAccount: Address | null = null;
let teeKeyId: string | null = null;

// Initialize TEE wallet on startup
async function initializeTeeWallet() {
  try {
    if (isTeeEnvironment()) {
      console.log('🚀 Initializing TEE wallet...');

      // Get key ID from environment or use default
      const keyId = process.env.KEY_ID || 'evm:base:sepolia';
      teeKeyId = keyId;

      // Get private key (will try ROFL keygen first, then fallback)
      const privateKey = await getTeePrivateKey(keyId);
      const account = secretKeyToAccount(privateKey);
      teeAccount = checksumAddress(account.address);

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔐 TEE Wallet Information');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📍 Address: ${teeAccount}`);
      console.log(`🔑 Key ID:  ${teeKeyId}`);

      // Initialize wallet client if RPC URL is provided
      const rpcUrl = process.env.RPC_URL;
      const chainId = parseInt(process.env.CHAIN_ID || '1', 10);

      if (rpcUrl) {
        teeWallet = connectWallet(privateKey, rpcUrl, chainId);
        console.log(`🌐 Network: Chain ID ${chainId}`);
        console.log(`🔗 RPC URL: ${rpcUrl}`);
        console.log(`✅ Wallet client initialized and connected`);
      } else {
        console.log(`⚠️  No RPC URL provided - wallet client not connected`);
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } else {
      console.log('⚠️  Not running in TEE environment - wallet not initialized\n');
    }
  } catch (error: any) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Failed to initialize TEE wallet');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(`Error: ${error.message}`);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

// Initialize on startup (async)
(async () => {
  await initializeTeeWallet();
  initializeOffchainManager();
  console.log(`🚀 Server starting on port ${PORT}...\n`);
})();

// Middleware
app.use(express.json({ limit: '10mb' }));

// In-memory job storage
interface Job {
  status: 'processing' | 'completed' | 'failed';
  timestamp: number;
  result?: string;
  error?: string;
}

const jobs: Map<string, Job> = new Map();

// Model constraints
const MAX_DOCUMENT_LENGTH = 400000; // ~100K tokens
const MIN_DOCUMENT_LENGTH = 50;

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'Assura TEE Service',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      address: 'GET /address',
      walletInfo: 'GET /wallet/info',
      signMessage: 'POST /wallet/sign',
      attest: 'POST /attest (with optional username for registration)',
      attestations: 'GET /user/:address/attestations',
      latestAttestation: 'GET /user/:address/latest',
      users: 'GET /users',
      stats: 'GET /stats',
      register: 'POST /register (standalone registration)',
      profile: 'GET /profile/:username',
      profileByAddress: 'GET /profile/address/:address',
      usernameAvailable: 'GET /username/:username/available',
      profiles: 'GET /profiles',
      updateCompliance: 'PUT /profile/:username/compliance',
      sanctions: 'GET /sanctions/stats',
      refreshSanctions: 'POST /sanctions/refresh',
      summarize: 'POST /summarize-doc',
      subnames: 'GET /subnames',
    },
  });
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    tee: {
      enabled: isTeeEnvironment(),
      walletInitialized: teeWallet !== null,
      account: teeAccount,
    },
  });
});

// Get TEE wallet address (simple endpoint for production)
app.get('/address', (req: Request, res: Response) => {
  if (!teeAccount) {
    return res.status(503).json({
      error: 'TEE wallet not initialized',
    });
  }

  res.json({
    address: teeAccount,
  });
});

// Get TEE wallet info (detailed)
app.get('/wallet/info', (req: Request, res: Response) => {
  if (!teeAccount) {
    return res.status(503).json({
      error: 'TEE wallet not initialized',
      teeEnvironment: isTeeEnvironment(),
    });
  }

  res.json({
    address: teeAccount,
    keyId: teeKeyId,
    walletInitialized: teeWallet !== null,
    teeEnvironment: isTeeEnvironment(),
    chainId: process.env.CHAIN_ID || null,
    rpcUrl: process.env.RPC_URL || null,
  });
});

// Sign a message with TEE wallet
app.post('/wallet/sign', async (req: Request, res: Response) => {
  try {
    if (!teeWallet) {
      return res.status(503).json({
        error: 'TEE wallet not initialized. Set RPC_URL and CHAIN_ID environment variables.',
      });
    }

    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required (string)' });
    }

    const signature = await signPersonalMessage(teeWallet, message);

    res.json({
      message,
      signature,
      address: teeAccount,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to sign message' });
  }
});

// Create attestation with TEE signature (with optional registration)
app.post('/attest', async (req: Request, res: Response) => {
  try {
    if (!teeWallet || !teeAccount) {
      return res.status(503).json({
        error: 'TEE wallet not initialized',
      });
    }

    const { userAddress, chainId: requestChainId, username } = req.body;

    if (!userAddress || typeof userAddress !== 'string') {
      return res.status(400).json({ error: 'userAddress is required (string)' });
    }

    // Validate Ethereum address format
    if (!/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
      return res.status(400).json({ error: 'Invalid Ethereum address format' });
    }

    // Check if address is sanctioned
    const sanctionInfo = await isSanctioned(userAddress);
    if (sanctionInfo) {
      console.log(`🚫 Sanctioned address blocked: ${userAddress} - Entity: ${sanctionInfo.entity}`);
      return res.status(403).json({
        error: 'Address is sanctioned and cannot receive attestation',
        reason: 'SANCTIONED_ADDRESS',
        entity: sanctionInfo.entity,
        source: sanctionInfo.source,
      });
    }

    // Check if user is registered
    const isRegistered = hasRegisteredUsername(userAddress);
    const existingProfile = isRegistered ? getUserProfileByAddress(userAddress) : null;

    // If not registered and no username provided, require registration
    if (!isRegistered && !username) {
      return res.status(403).json({
        error: 'User not registered. Please provide a username to register first.',
        requiresRegistration: true,
      });
    }

    // If username provided, handle registration
    if (username && typeof username === 'string') {
      // If already registered, check if trying to use different username
      if (isRegistered) {
        return res.status(409).json({
          error: `Address ${userAddress} is already registered with username "${existingProfile?.username}"`,
          existingProfile,
        });
      }

      // Validate username format
      const usernameLower = username.toLowerCase();
      if (!/^[a-z0-9-]+$/.test(usernameLower)) {
        return res.status(400).json({
          error: 'Invalid username. Must contain only lowercase letters, numbers, and hyphens.'
        });
      }

      // Check if username is available
      if (!isUsernameAvailable(usernameLower)) {
        return res.status(409).json({
          error: `Username "${username}" is already registered`,
        });
      }

      // Check ENS subname availability
      const ensAvailable = await checkSubnameAvailability(usernameLower, PARENT_NAME);
      if (!ensAvailable) {
        return res.status(409).json({
          error: `ENS subname "${usernameLower}.${PARENT_NAME}" is already registered`,
        });
      }
    }

    // Use provided chain ID or default from environment
    const chainId = requestChainId || parseInt(process.env.CHAIN_ID || '84532', 10);

    // Calculate compliance score based on wallet metrics and KYC status
    // For existing users, use their KYC status; for new users, start with false/false
    const aKYCStatus = existingProfile?.aKYC ?? false;
    const eKYCStatus = existingProfile?.eKYC ?? false;

    const scoreCalculation = await calculateComplianceScore(userAddress, aKYCStatus, eKYCStatus, chainId);
    const score = scoreCalculation.totalScore;

    console.log(`📊 Score calculated for ${userAddress}:`);
    console.log(`   Total: ${score}/1000`);
    console.log(`   Breakdown: aKYC=${scoreCalculation.breakdown.aKYCScore}, eKYC=${scoreCalculation.breakdown.eKYCScore}, age=${scoreCalculation.breakdown.walletAgeScore}, balance=${scoreCalculation.breakdown.balanceScore}`);
    console.log(`   Metadata: ${scoreCalculation.metadata.walletAgeDays} days old, ${scoreCalculation.metadata.walletBalanceETH} ETH`);

    // Get current timestamp
    const timeAtWhichAttested = Math.floor(Date.now() / 1000);

    // Create attested data structure
    const attestedData = {
      score: BigInt(score),
      timeAtWhichAttested: BigInt(timeAtWhichAttested),
      chainId: BigInt(chainId),
    };

    // Encode the data for EIP-191 signature
    const { encodeAbiParameters, keccak256 } = await import('viem');
    const encodedData = encodeAbiParameters(
      [
        { name: 'score', type: 'uint256' },
        { name: 'timeAtWhichAttested', type: 'uint256' },
        { name: 'chainId', type: 'uint256' },
      ],
      [attestedData.score, attestedData.timeAtWhichAttested, attestedData.chainId]
    );

    const dataHash = keccak256(encodedData);

    // Sign with EIP-191 (personal_sign)
    const signature = await teeWallet.signMessage({
      account: teeWallet.account!,
      message: { raw: dataHash },
    });

    // Handle registration if username provided
    let registrationData = null;
    if (username && !isRegistered) {
      const usernameLower = username.toLowerCase();

      // eKYC and aKYC start as false on registration
      // They will be updated to true only after manual verification by compliance team
      const eKYCStatus = false;
      const aKYCStatus = false;

      // Create ENS subname with compliance data
      const textRecords = [
        { key: 'score', value: score.toString() },
        { key: 'eKYC', value: eKYCStatus.toString() },
        { key: 'aKYC', value: aKYCStatus.toString() },
        { key: 'registeredAt', value: timeAtWhichAttested.toString() },
        { key: 'teeAddress', value: teeAccount },
      ];

      const ensResult = await createSubname({
        label: usernameLower,
        parentName: PARENT_NAME,
        owner: userAddress,
        texts: textRecords,
        addresses: [
          { chain: ChainName.Ethereum, value: userAddress },
        ],
        metadata: [
          { key: 'description', value: `Assura compliance profile for ${userAddress}` },
          { key: 'createdBy', value: 'Assura TEE' },
        ],
      });

      const ensFullName = `${usernameLower}.${PARENT_NAME}`;

      // Register user profile
      registerUserProfile({
        userAddress: userAddress.toLowerCase(),
        username: usernameLower,
        ensFullName,
        score,
        eKYC: eKYCStatus,
        aKYC: aKYCStatus,
        registeredAt: timeAtWhichAttested,
        lastAttestationAt: timeAtWhichAttested,
      });

      registrationData = {
        username: usernameLower,
        ensFullName,
        eKYC: eKYCStatus,
        aKYC: aKYCStatus,
        textRecords,
      };
    }

    // Determine eKYC and aKYC status for this attestation
    // For existing users, keep their existing status
    // For new users, start with false (will be updated by compliance team later)
    const attestationEKYC = existingProfile?.eKYC ?? false;
    const attestationAKYC = existingProfile?.aKYC ?? false;

    // Store attestation in TEE storage
    addUserAttestation({
      userAddress: userAddress.toLowerCase(),
      score,
      timestamp: timeAtWhichAttested,
      chainId,
      signature,
      teeAddress: teeAccount,
      username: existingProfile?.username || (username ? username.toLowerCase() : undefined),
      eKYC: attestationEKYC,
      aKYC: attestationAKYC,
    });

    const response: any = {
      attestedData: {
        score: attestedData.score.toString(),
        timeAtWhichAttested: attestedData.timeAtWhichAttested.toString(),
        chainId: attestedData.chainId.toString(),
      },
      signature,
      teeAddress: teeAccount,
      userAddress,
    };

    // Include registration data if user was just registered
    if (registrationData) {
      response.registration = {
        success: true,
        ...registrationData,
      };
    }

    // Include existing profile if already registered
    if (existingProfile && !registrationData) {
      response.profile = existingProfile;
    }

    res.json(response);
  } catch (error: any) {
    console.error('Attestation error:', error);
    res.status(500).json({ error: error.message || 'Failed to create attestation' });
  }
});

// Get user attestation history
app.get('/user/:address/attestations', (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address format' });
    }

    const attestations = getUserAttestations(address);
    res.json({
      userAddress: address,
      attestationCount: attestations.length,
      attestations,
    });
  } catch (error: any) {
    console.error('Error fetching user attestations:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch attestations' });
  }
});

// Get user's latest attestation
app.get('/user/:address/latest', (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address format' });
    }

    const attestation = getLatestUserAttestation(address);

    if (!attestation) {
      return res.status(404).json({ error: 'No attestations found for this user' });
    }

    res.json({
      userAddress: address,
      attestation,
    });
  } catch (error: any) {
    console.error('Error fetching latest attestation:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch latest attestation' });
  }
});

// Get all users with attestations
app.get('/users', (req: Request, res: Response) => {
  try {
    const users = getAllUsers();
    res.json({
      totalUsers: users.length,
      users,
    });
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch users' });
  }
});

// Get storage statistics
app.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = getStorageStats();
    res.json(stats);
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch statistics' });
  }
});

// ==================== Profile & ENS Registration Endpoints ====================

// POST: Register new user with ENS username and compliance data
app.post('/register', async (req: Request, res: Response) => {
  try {
    if (!teeWallet || !teeAccount) {
      return res.status(503).json({
        error: 'TEE wallet not initialized',
      });
    }

    const { userAddress, username } = req.body;

    // Validate required fields
    if (!userAddress || typeof userAddress !== 'string') {
      return res.status(400).json({ error: 'userAddress is required (string)' });
    }

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'username is required (string)' });
    }

    // Validate Ethereum address format
    if (!/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
      return res.status(400).json({ error: 'Invalid Ethereum address format' });
    }

    // Check if address is sanctioned
    const sanctionInfo = await isSanctioned(userAddress);
    if (sanctionInfo) {
      console.log(`🚫 Sanctioned address blocked from registration: ${userAddress} - Entity: ${sanctionInfo.entity}`);
      return res.status(403).json({
        error: 'Address is sanctioned and cannot register',
        reason: 'SANCTIONED_ADDRESS',
        entity: sanctionInfo.entity,
        source: sanctionInfo.source,
      });
    }

    // Validate username format (lowercase letters, numbers, hyphens only)
    const usernameLower = username.toLowerCase();
    if (!/^[a-z0-9-]+$/.test(usernameLower)) {
      return res.status(400).json({
        error: 'Invalid username. Must contain only lowercase letters, numbers, and hyphens.'
      });
    }

    // Check if username is already registered in our storage
    if (!isUsernameAvailable(usernameLower)) {
      return res.status(409).json({
        error: `Username "${username}" is already registered`,
      });
    }

    // Check if address already has a registered username
    if (hasRegisteredUsername(userAddress)) {
      const existingProfile = getUserProfileByAddress(userAddress);
      return res.status(409).json({
        error: `Address ${userAddress} is already registered with username "${existingProfile?.username}"`,
        existingProfile,
      });
    }

    // Check if ENS subname is available
    const ensAvailable = await checkSubnameAvailability(usernameLower, PARENT_NAME);
    if (!ensAvailable) {
      return res.status(409).json({
        error: `ENS subname "${usernameLower}.${PARENT_NAME}" is already registered`,
      });
    }

    // Get chain ID from environment
    const chainId = parseInt(process.env.CHAIN_ID || '84532', 10);

    // Calculate initial compliance score (new users start with aKYC=false, eKYC=false)
    const scoreCalculation = await calculateInitialScore(userAddress, chainId);
    const score = scoreCalculation.totalScore;

    console.log(`📊 Initial score calculated for new user ${userAddress}:`);
    console.log(`   Total: ${score}/1000`);
    console.log(`   Breakdown: wallet age=${scoreCalculation.breakdown.walletAgeScore}, balance=${scoreCalculation.breakdown.balanceScore}`);
    console.log(`   Metadata: ${scoreCalculation.metadata.walletAgeDays} days old, ${scoreCalculation.metadata.walletBalanceETH} ETH`);

    // Get current timestamp
    const timeAtWhichAttested = Math.floor(Date.now() / 1000);

    // Create attested data and signature
    const attestedData = {
      score: BigInt(score),
      timeAtWhichAttested: BigInt(timeAtWhichAttested),
      chainId: BigInt(chainId),
    };

    const { encodeAbiParameters, keccak256 } = await import('viem');
    const encodedData = encodeAbiParameters(
      [
        { name: 'score', type: 'uint256' },
        { name: 'timeAtWhichAttested', type: 'uint256' },
        { name: 'chainId', type: 'uint256' },
      ],
      [attestedData.score, attestedData.timeAtWhichAttested, attestedData.chainId]
    );

    const dataHash = keccak256(encodedData);
    const signature = await teeWallet.signMessage({
      account: teeWallet.account!,
      message: { raw: dataHash },
    });

    // eKYC and aKYC start as false on registration
    // They will be updated to true only after manual verification by compliance team
    const eKYCStatus = false;
    const aKYCStatus = false;

    const textRecords = [
      { key: 'score', value: score.toString() },
      { key: 'eKYC', value: eKYCStatus.toString() },
      { key: 'aKYC', value: aKYCStatus.toString() },
      { key: 'registeredAt', value: timeAtWhichAttested.toString() },
      { key: 'teeAddress', value: teeAccount },
    ];

    // Create ENS subname with compliance data in text records
    const ensResult = await createSubname({
      label: usernameLower,
      parentName: PARENT_NAME,
      owner: userAddress,
      texts: textRecords,
      addresses: [
        { chain: ChainName.Ethereum, value: userAddress },
      ],
      metadata: [
        { key: 'description', value: `Assura compliance profile for ${userAddress}` },
        { key: 'createdBy', value: 'Assura TEE' },
      ],
    });

    const ensFullName = `${usernameLower}.${PARENT_NAME}`;

    // Store attestation in TEE storage
    addUserAttestation({
      userAddress: userAddress.toLowerCase(),
      score,
      timestamp: timeAtWhichAttested,
      chainId,
      signature,
      teeAddress: teeAccount,
      username: usernameLower,
      eKYC: eKYCStatus,
      aKYC: aKYCStatus,
    });

    // Register user profile
    registerUserProfile({
      userAddress: userAddress.toLowerCase(),
      username: usernameLower,
      ensFullName,
      score,
      eKYC: eKYCStatus,
      aKYC: aKYCStatus,
      registeredAt: timeAtWhichAttested,
      lastAttestationAt: timeAtWhichAttested,
    });

    res.status(201).json({
      success: true,
      profile: {
        userAddress,
        username: usernameLower,
        ensFullName,
        score,
        eKYC: eKYCStatus,
        aKYC: aKYCStatus,
        registeredAt: timeAtWhichAttested,
      },
      attestation: {
        attestedData: {
          score: attestedData.score.toString(),
          timeAtWhichAttested: attestedData.timeAtWhichAttested.toString(),
          chainId: attestedData.chainId.toString(),
        },
        signature,
        teeAddress: teeAccount,
      },
      ens: {
        fullName: ensFullName,
        textRecords,
        ensResult,
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Failed to register user' });
  }
});

// GET: Get user profile by username
app.get('/profile/:username', (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }

    const profile = getUserProfile(username);

    if (!profile) {
      return res.status(404).json({
        error: `Profile not found for username "${username}"`,
      });
    }

    res.json({
      profile,
    });
  } catch (error: any) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch profile' });
  }
});

// GET: Get user profile by address
app.get('/profile/address/:address', (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address format' });
    }

    const profile = getUserProfileByAddress(address);

    if (!profile) {
      return res.status(404).json({
        error: `No profile found for address ${address}`,
      });
    }

    res.json({
      profile,
    });
  } catch (error: any) {
    console.error('Error fetching profile by address:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch profile' });
  }
});

// GET: Check username availability
app.get('/username/:username/available', (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }

    const usernameLower = username.toLowerCase();
    const available = isUsernameAvailable(usernameLower);

    res.json({
      username: usernameLower,
      available,
    });
  } catch (error: any) {
    console.error('Error checking username availability:', error);
    res.status(500).json({ error: error.message || 'Failed to check username availability' });
  }
});

// GET: Get all profiles
app.get('/profiles', (req: Request, res: Response) => {
  try {
    const profiles = getAllProfiles();
    res.json({
      totalProfiles: profiles.length,
      profiles,
    });
  } catch (error: any) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch profiles' });
  }
});

// PUT: Update user compliance status (eKYC/aKYC)
app.put('/profile/:username/compliance', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const { eKYC, aKYC } = req.body;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }

    const usernameLower = username.toLowerCase();
    const profile = getUserProfile(usernameLower);

    if (!profile) {
      return res.status(404).json({
        error: `Profile not found for username "${username}"`,
      });
    }

    // Prepare updates
    const updates: any = {};
    if (typeof eKYC === 'boolean') updates.eKYC = eKYC;
    if (typeof aKYC === 'boolean') updates.aKYC = aKYC;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid updates provided. Specify eKYC or aKYC as boolean.',
      });
    }

    // Update profile in storage
    updateUserProfile(usernameLower, updates);

    // Update ENS text records
    const updatedProfile = getUserProfile(usernameLower)!;

    // Update ENS subname with new compliance data
    await createSubname({
      label: usernameLower,
      parentName: PARENT_NAME,
      owner: profile.userAddress,
      texts: [
        { key: 'score', value: updatedProfile.score.toString() },
        { key: 'eKYC', value: updatedProfile.eKYC.toString() },
        { key: 'aKYC', value: updatedProfile.aKYC.toString() },
        { key: 'registeredAt', value: updatedProfile.registeredAt.toString() },
        { key: 'lastUpdated', value: Math.floor(Date.now() / 1000).toString() },
      ],
    });

    res.json({
      success: true,
      profile: updatedProfile,
      message: 'Compliance status updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating compliance status:', error);
    res.status(500).json({ error: error.message || 'Failed to update compliance status' });
  }
});

// ==================== Sanctions Endpoints ====================

// GET: Get sanctions list statistics
app.get('/sanctions/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getSanctionsStats();
    res.json({
      ...stats,
      description: 'Statistics for sanctioned addresses from OFAC and other sources',
    });
  } catch (error: any) {
    console.error('Error fetching sanctions stats:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch sanctions statistics' });
  }
});

// POST: Force refresh sanctions list from GitHub
app.post('/sanctions/refresh', async (req: Request, res: Response) => {
  try {
    await refreshSanctionsList();
    const stats = await getSanctionsStats();
    res.json({
      success: true,
      message: 'Sanctions list refreshed successfully',
      stats,
    });
  } catch (error: any) {
    console.error('Error refreshing sanctions list:', error);
    res.status(500).json({ error: error.message || 'Failed to refresh sanctions list' });
  }
});

// ==================== Document Processing Endpoints ====================

// Summarize document endpoint
app.post('/summarize-doc', async (req: Request, res: Response) => {
  try {
    const { document } = req.body;

    if (!document || typeof document !== 'string') {
      return res.status(400).json({ error: 'Document is required' });
    }

    const docLength = document.length;

    if (docLength < MIN_DOCUMENT_LENGTH) {
      return res.status(400).json({
        error: `Document too short. Minimum length is ${MIN_DOCUMENT_LENGTH} characters.`,
      });
    }

    if (docLength > MAX_DOCUMENT_LENGTH) {
      return res.status(400).json({
        error: `Document too long. Maximum length is ${MAX_DOCUMENT_LENGTH} characters (~100K tokens).`,
      });
    }

    // Create job ID
    const jobId = uuidv4();
    jobs.set(jobId, {
      status: 'processing',
      timestamp: Math.floor(Date.now() / 1000),
    });

    // Process document asynchronously (simple placeholder)
    processDocument(jobId, document).catch((error) => {
      const job = jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
      }
    });

    // Return job ID immediately
    res.json({
      job_id: jobId,
      status: 'processing',
      status_url: `/summarize-doc/${jobId}`,
      timestamp: Math.floor(Date.now() / 1000),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get summary status
app.get('/summarize-doc/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

// ==================== ENS Subname Endpoints ====================

const PARENT_NAME = 'assuranet.eth';

// GET: Check subname availability
app.get('/subname/:label/available', async (req: Request, res: Response) => {
  try {
    const { label } = req.params;

    if (!label || !/^[a-z0-9-]+$/.test(label)) {
      return res.status(400).json({
        error: 'Invalid label. Must contain only lowercase letters, numbers, and hyphens.'
      });
    }

    const isAvailable = await checkSubnameAvailability(label, PARENT_NAME);

    res.json({
      label,
      parentName: PARENT_NAME,
      fullName: `${label}.${PARENT_NAME}`,
      isAvailable,
    });
  } catch (error: any) {
    console.error('Error checking subname availability:', error);
    res.status(500).json({
      error: error.message || 'Failed to check subname availability'
    });
  }
});

// GET: Get specific subname details
app.get('/subname/:label', async (req: Request, res: Response) => {
  try {
    const { label } = req.params;

    if (!label || !/^[a-z0-9-]+$/.test(label)) {
      return res.status(400).json({
        error: 'Invalid label. Must contain only lowercase letters, numbers, and hyphens.'
      });
    }

    const subname = await getSubname(label, PARENT_NAME);

    if (!subname) {
      return res.status(404).json({
        error: 'Subname not found',
        label,
        parentName: PARENT_NAME,
      });
    }

    res.json({
      subname: `${label}.${PARENT_NAME}`,
      data: subname,
    });
  } catch (error: any) {
    console.error('Error getting subname:', error);
    res.status(500).json({
      error: error.message || 'Failed to get subname'
    });
  }
});

// GET: List all subnames (with optional filters)
app.get('/subnames', async (req: Request, res: Response) => {
  try {
    const { owner, search, page, size } = req.query;

    const result = await getSubnames(PARENT_NAME, {
      owner: owner as string,
      labelSearch: search as string,
      page: page ? parseInt(page as string, 10) : 1,
      size: size ? parseInt(size as string, 10) : 10,
    });

    res.json({
      parentName: PARENT_NAME,
      ...result,
    });
  } catch (error: any) {
    console.error('Error listing subnames:', error);
    res.status(500).json({
      error: error.message || 'Failed to list subnames'
    });
  }
});

// GET: Get text records for a subname
app.get('/subname/:label/texts', async (req: Request, res: Response) => {
  try {
    const { label } = req.params;

    if (!label || !/^[a-z0-9-]+$/.test(label)) {
      return res.status(400).json({
        error: 'Invalid label. Must contain only lowercase letters, numbers, and hyphens.'
      });
    }

    const texts = await getTextRecords(label, PARENT_NAME);

    res.json({
      subname: `${label}.${PARENT_NAME}`,
      texts,
    });
  } catch (error: any) {
    console.error('Error getting text records:', error);
    res.status(500).json({
      error: error.message || 'Failed to get text records'
    });
  }
});

// GET: Get specific text record for a subname
app.get('/subname/:label/text/:key', async (req: Request, res: Response) => {
  try {
    const { label, key } = req.params;

    if (!label || !/^[a-z0-9-]+$/.test(label)) {
      return res.status(400).json({
        error: 'Invalid label. Must contain only lowercase letters, numbers, and hyphens.'
      });
    }

    const value = await getTextRecord(label, PARENT_NAME, key);

    res.json({
      subname: `${label}.${PARENT_NAME}`,
      key,
      value,
    });
  } catch (error: any) {
    console.error('Error getting text record:', error);
    res.status(500).json({
      error: error.message || 'Failed to get text record'
    });
  }
});

// POST: Create/set a new subname
app.post('/subname', async (req: Request, res: Response) => {
  try {
    const { label, owner, texts, addresses, metadata } = req.body;

    if (!label || typeof label !== 'string') {
      return res.status(400).json({ error: 'Label is required (string)' });
    }

    if (!/^[a-z0-9-]+$/.test(label)) {
      return res.status(400).json({
        error: 'Invalid label. Must contain only lowercase letters, numbers, and hyphens.'
      });
    }

    // Check if subname is available
    const isAvailable = await checkSubnameAvailability(label, PARENT_NAME);
    if (!isAvailable) {
      return res.status(409).json({
        error: 'Subname already exists',
        subname: `${label}.${PARENT_NAME}`,
      });
    }

    // Create the subname
    const result = await createSubname({
      label,
      parentName: PARENT_NAME,
      owner,
      texts,
      addresses,
      metadata,
    });

    res.status(201).json({
      success: true,
      subname: `${label}.${PARENT_NAME}`,
      data: result,
    });
  } catch (error: any) {
    console.error('Error creating subname:', error);
    res.status(500).json({
      error: error.message || 'Failed to create subname'
    });
  }
});

// Simple document processing function (placeholder - replace with actual logic)
async function processDocument(jobId: string, document: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simple placeholder summary (replace with actual summarization logic)
    const summary = `Summary of document (${document.length} characters): ${document.substring(0, 200)}...`;

    job.status = 'completed';
    job.result = summary;
  } catch (error: any) {
    job.status = 'failed';
    job.error = error.message || 'Processing failed';
  }
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});


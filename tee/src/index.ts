import 'dotenv/config';
import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getTeePrivateKey, isTeeEnvironment } from './utils/tee-keys';
import { connectWallet, secretKeyToAccount, checksumAddress, signPersonalMessage, type WalletClient } from './utils/wallet';
import type { Address } from 'viem';
import {
  initializeOffchainManager,
  checkSubnameAvailability,
  getSubname,
  getSubnames,
  createSubname,
  getTextRecords,
  getTextRecord,
} from './utils/subname-manager';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// TEE Wallet initialization
let teeWallet: WalletClient | null = null;
let teeAccount: Address | null = null;

// Initialize TEE wallet on startup
function initializeTeeWallet() {
  try {
    if (isTeeEnvironment()) {
      const privateKey = getTeePrivateKey();
      const account = secretKeyToAccount(privateKey);
      teeAccount = checksumAddress(account.address);
      
      // Initialize wallet client if RPC URL is provided
      const rpcUrl = process.env.RPC_URL;
      const chainId = parseInt(process.env.CHAIN_ID || '1', 10);
      
      if (rpcUrl) {
        teeWallet = connectWallet(privateKey, rpcUrl, chainId);
        console.log(`✅ TEE Wallet initialized: ${teeAccount}`);
      } else {
        console.log(`⚠️  TEE Account loaded: ${teeAccount} (no RPC URL, wallet client not initialized)`);
      }
    } else {
      console.log('⚠️  Not running in TEE environment');
    }
  } catch (error: any) {
    console.error('❌ Failed to initialize TEE wallet:', error.message);
  }
}

// Initialize on startup
initializeTeeWallet();
initializeOffchainManager();

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
    service: 'ROFL Document Summarization',
    endpoint: 'POST /summarize-doc',
    version: '1.0.0',
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

// Get TEE wallet info
app.get('/wallet/info', (req: Request, res: Response) => {
  if (!teeAccount) {
    return res.status(503).json({ 
      error: 'TEE wallet not initialized',
      teeEnvironment: isTeeEnvironment(),
    });
  }

  res.json({
    address: teeAccount,
    walletInitialized: teeWallet !== null,
    teeEnvironment: isTeeEnvironment(),
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


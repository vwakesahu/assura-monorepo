import * as dotenv from "dotenv";
import axios from "axios";

// Load environment variables
dotenv.config();

// Configure axios with timeout and retry logic
const axiosConfig = {
  timeout: 30000, // 30 second timeout
  headers: {
    'Connection': 'close', // Prevent connection reuse issues
  },
};

/**
 * Retry helper for handling intermittent connection issues
 */
async function retryRequest<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

/**
 * Fetch TEE address from the TEE service
 * @param teeServiceUrl URL of the TEE service (defaults to TEE_SERVICE_URL from env or http://localhost:3000)
 * @returns TEE wallet address
 */
export async function getTeeAddress(teeServiceUrl?: string): Promise<string> {
  const url = teeServiceUrl || process.env.TEE_SERVICE_URL || "http://localhost:3000";

  try {
    const response = await retryRequest(async () => {
      return await axios.get(`${url}/address`, axiosConfig);
    });

    if (!response.data || !response.data.address) {
      throw new Error("Invalid response from TEE service");
    }

    return response.data.address as string;
  } catch (error: any) {
    if (error.code === "ECONNREFUSED") {
      throw new Error(`Cannot connect to TEE service at ${url}. Make sure the TEE service is running.`);
    }
    throw new Error(`Failed to fetch TEE address: ${error.message}`);
  }
}

/**
 * Get attestation from TEE service
 * @param userAddress User address to attest for
 * @param chainId Chain ID (optional)
 * @param teeServiceUrl URL of the TEE service (optional)
 * @param username Username for registration (optional, required for first-time users)
 * @returns Attestation data with signature (score, eKYC, and aKYC are determined by TEE)
 */
export async function getAttestation(
  userAddress: string,
  chainId?: number,
  teeServiceUrl?: string,
  username?: string
): Promise<{
  attestedData: {
    score: string;
    timeAtWhichAttested: string;
    chainId: string;
  };
  signature: string;
  teeAddress: string;
  userAddress: string;
  registration?: {
    success: boolean;
    username: string;
    ensFullName: string;
    eKYC: boolean;
    aKYC: boolean;
  };
  profile?: any;
}> {
  const url = teeServiceUrl || process.env.TEE_SERVICE_URL || "http://localhost:3000";

  try {
    const requestBody: any = {
      userAddress,
      chainId: chainId || 84532,
    };

    // Add optional username for registration
    if (username) requestBody.username = username;

    const response = await retryRequest(async () => {
      return await axios.post(`${url}/attest`, requestBody, axiosConfig);
    });

    if (!response.data || !response.data.attestedData || !response.data.signature) {
      throw new Error("Invalid response from TEE service");
    }

    return response.data;
  } catch (error: any) {
    if (error.code === "ECONNREFUSED") {
      throw new Error(`Cannot connect to TEE service at ${url}. Make sure the TEE service is running.`);
    }

    // Handle registration required error
    if (error.response?.status === 403 && error.response?.data?.requiresRegistration) {
      throw new Error(`User not registered. Please provide a username to register first. Call getAttestation with username parameter.`);
    }

    // Handle 409 Conflict - user already registered
    if (error.response?.status === 409 && username) {
      console.log(`ℹ️  User already registered, fetching existing profile...`);
      // Retry without username to get existing profile
      const retryResponse = await retryRequest(async () => {
        return await axios.post(`${url}/attest`, {
          userAddress,
          chainId: chainId || 84532,
        }, axiosConfig);
      });

      if (!retryResponse.data || !retryResponse.data.attestedData || !retryResponse.data.signature) {
        throw new Error("Invalid response from TEE service");
      }

      return retryResponse.data;
    }

    throw new Error(`Failed to get attestation: ${error.message}`);
  }
}

// CLI usage (ES module check)
if (import.meta.url === `file://${process.argv[1]}`) {
  getTeeAddress()
    .then((address) => {
      console.log(JSON.stringify({ address }, null, 2));
    })
    .catch((error) => {
      console.error("Error:", error.message);
      process.exit(1);
    });
}

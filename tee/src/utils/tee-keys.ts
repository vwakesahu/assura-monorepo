import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Get the TEE private key from secure storage
 * In Oasis ROFL TEE, keys are typically stored in:
 * - Environment variables
 * - Secure file system paths
 * - appd socket communication
 */
export function getTeePrivateKey(): string {
  // Try environment variable first
  const envKey = process.env.TEE_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (envKey) {
    return envKey.startsWith('0x') ? envKey : `0x${envKey}`;
  }

  // Try reading from secure storage path (common in TEE environments)
  const keyPaths = [
    '/run/secrets/private_key',
    '/run/tee/private_key',
    '/secure/private_key',
    join(process.cwd(), '.tee', 'private_key'),
  ];

  for (const keyPath of keyPaths) {
    try {
      const key = readFileSync(keyPath, 'utf-8').trim();
      return key.startsWith('0x') ? key : `0x${key}`;
    } catch (error) {
      // File doesn't exist, try next path
      continue;
    }
  }

  throw new Error(
    'TEE private key not found. Set TEE_PRIVATE_KEY environment variable or place key in secure storage.'
  );
}

/**
 * Check if we're running in a TEE environment
 */
export function isTeeEnvironment(): boolean {
  return (
    process.env.TEE_ENABLED === 'true' ||
    process.env.ROFL_APP_ID !== undefined ||
    process.env.TEE_PRIVATE_KEY !== undefined ||
    process.platform === 'linux'
  );
}


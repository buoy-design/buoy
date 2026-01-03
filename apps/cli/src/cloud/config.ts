/**
 * Buoy Cloud Configuration
 *
 * Manages cloud credentials and settings stored in ~/.buoy/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Config directory and file paths
const CONFIG_DIR = join(homedir(), '.buoy');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Default API endpoint
const DEFAULT_API_ENDPOINT = 'https://api.buoy.design';

export interface CloudConfig {
  apiToken?: string;
  apiEndpoint?: string;
  userId?: string;
  accountId?: string;
  accountName?: string;
  email?: string;
}

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Read cloud config from disk
 */
export function readCloudConfig(): CloudConfig {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return {};
    }
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content) as CloudConfig;
  } catch {
    return {};
  }
}

/**
 * Write cloud config to disk
 */
export function writeCloudConfig(config: CloudConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    mode: 0o600, // Owner read/write only
  });
}

/**
 * Update specific fields in cloud config
 */
export function updateCloudConfig(updates: Partial<CloudConfig>): CloudConfig {
  const config = readCloudConfig();
  const newConfig = { ...config, ...updates };
  writeCloudConfig(newConfig);
  return newConfig;
}

/**
 * Clear cloud config (logout)
 */
export function clearCloudConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    unlinkSync(CONFIG_FILE);
  }
}

/**
 * Get the API token if configured
 */
export function getApiToken(): string | undefined {
  const config = readCloudConfig();
  return config.apiToken;
}

/**
 * Get the API endpoint
 */
export function getApiEndpoint(): string {
  const config = readCloudConfig();
  return config.apiEndpoint || DEFAULT_API_ENDPOINT;
}

/**
 * Check if user is logged in
 */
export function isLoggedIn(): boolean {
  const config = readCloudConfig();
  return !!config.apiToken;
}

/**
 * Get authenticated user info
 */
export function getAuthenticatedUser(): {
  userId?: string;
  accountId?: string;
  accountName?: string;
  email?: string;
} | null {
  const config = readCloudConfig();
  if (!config.apiToken) return null;
  return {
    userId: config.userId,
    accountId: config.accountId,
    accountName: config.accountName,
    email: config.email,
  };
}

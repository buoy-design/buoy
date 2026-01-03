/**
 * Cloud Sync Utilities
 *
 * Handles uploading scans to Buoy Cloud with offline support.
 */

import { execSync } from 'child_process';
import { isLoggedIn } from './config.js';
import {
  uploadScan,
  type UploadScanRequest,
  type ScanComponent,
  type ScanToken,
  type ScanDriftSignal,
} from './client.js';
import {
  queueScan,
  getPendingScans,
  removeFromQueue,
  updateQueuedScan,
  getQueueCount,
} from './queue.js';

export interface SyncResult {
  success: boolean;
  scanId?: string;
  queued?: boolean;
  error?: string;
}

/**
 * Get git metadata for current commit
 */
export function getGitMetadata(cwd: string): {
  commitSha?: string;
  branch?: string;
  author?: string;
} {
  try {
    const commitSha = execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();
    const author = execSync('git log -1 --format="%an <%ae>"', { cwd, encoding: 'utf-8' }).trim();
    return { commitSha, branch, author };
  } catch {
    return {};
  }
}

/**
 * Convert CLI scan results to API format
 */
export function formatScanForUpload(
  components: Array<{
    name: string;
    path: string;
    framework?: string;
    props?: Array<{ name: string; type?: string; required?: boolean; defaultValue?: unknown }>;
    imports?: string[];
    loc?: number;
  }>,
  tokens: Array<{
    name: string;
    value: string;
    type: string;
    path?: string;
    source?: string;
  }>,
  drift: Array<{
    type: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    file?: string;
    line?: number;
    component?: string;
    token?: string;
    suggestion?: string;
  }>,
  gitMetadata?: { commitSha?: string; branch?: string; author?: string }
): UploadScanRequest {
  return {
    commitSha: gitMetadata?.commitSha,
    branch: gitMetadata?.branch,
    author: gitMetadata?.author,
    timestamp: new Date().toISOString(),
    components: components as ScanComponent[],
    tokens: tokens as ScanToken[],
    drift: drift as ScanDriftSignal[],
  };
}

/**
 * Upload scan results to Buoy Cloud
 * Returns immediately if not logged in or no cloud project linked.
 */
export async function syncScan(
  projectRoot: string,
  cloudProjectId: string,
  scanData: UploadScanRequest
): Promise<SyncResult> {
  // Check if logged in
  if (!isLoggedIn()) {
    return { success: false, error: 'Not logged in' };
  }

  try {
    const result = await uploadScan(cloudProjectId, scanData);

    if (result.ok && result.data) {
      return {
        success: true,
        scanId: result.data.id,
      };
    }

    // Upload failed - queue for retry
    queueScan(projectRoot, cloudProjectId, scanData, result.error);
    return {
      success: false,
      queued: true,
      error: result.error,
    };
  } catch (error) {
    // Network or other error - queue for retry
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    queueScan(projectRoot, cloudProjectId, scanData, errorMessage);
    return {
      success: false,
      queued: true,
      error: errorMessage,
    };
  }
}

/**
 * Retry uploading queued scans
 */
export async function syncQueue(
  projectRoot: string
): Promise<{ synced: number; failed: number; remaining: number }> {
  const pending = getPendingScans(projectRoot);
  let synced = 0;
  let failed = 0;

  for (const scan of pending) {
    try {
      const result = await uploadScan(scan.projectId, scan.data);

      if (result.ok) {
        removeFromQueue(projectRoot, scan.id);
        synced++;
      } else {
        updateQueuedScan(projectRoot, scan.id, {
          attempts: scan.attempts + 1,
          lastAttempt: new Date().toISOString(),
          error: result.error,
        });
        failed++;
      }
    } catch (error) {
      updateQueuedScan(projectRoot, scan.id, {
        attempts: scan.attempts + 1,
        lastAttempt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      failed++;
    }
  }

  const remaining = getQueueCount(projectRoot);
  return { synced, failed, remaining };
}

/**
 * Check if there are queued scans
 */
export function hasQueuedScans(projectRoot: string): boolean {
  return getQueueCount(projectRoot) > 0;
}

export { getQueueCount };

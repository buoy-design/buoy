/**
 * Offline Queue for Failed Uploads
 *
 * When scan uploads fail (network issues, API errors), they're queued
 * for retry. The queue is stored in .buoy/sync-queue.json in the project.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { UploadScanRequest } from './client.js';

const QUEUE_DIR = '.buoy';
const QUEUE_FILE = 'sync-queue.json';

export interface QueuedScan {
  id: string;
  projectId: string;
  data: UploadScanRequest;
  attempts: number;
  lastAttempt: string;
  error?: string;
  createdAt: string;
}

export interface SyncQueue {
  scans: QueuedScan[];
}

/**
 * Get the queue file path for a project
 */
function getQueuePath(projectRoot: string): string {
  return join(projectRoot, QUEUE_DIR, QUEUE_FILE);
}

/**
 * Ensure the .buoy directory exists
 */
function ensureQueueDir(projectRoot: string): void {
  const dir = join(projectRoot, QUEUE_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read the sync queue
 */
export function readQueue(projectRoot: string): SyncQueue {
  const queuePath = getQueuePath(projectRoot);
  try {
    if (!existsSync(queuePath)) {
      return { scans: [] };
    }
    const content = readFileSync(queuePath, 'utf-8');
    return JSON.parse(content) as SyncQueue;
  } catch {
    return { scans: [] };
  }
}

/**
 * Write the sync queue
 */
export function writeQueue(projectRoot: string, queue: SyncQueue): void {
  ensureQueueDir(projectRoot);
  const queuePath = getQueuePath(projectRoot);
  writeFileSync(queuePath, JSON.stringify(queue, null, 2));
}

/**
 * Add a failed scan to the queue
 */
export function queueScan(
  projectRoot: string,
  projectId: string,
  data: UploadScanRequest,
  error?: string
): QueuedScan {
  const queue = readQueue(projectRoot);
  const now = new Date().toISOString();

  const queuedScan: QueuedScan = {
    id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    projectId,
    data,
    attempts: 1,
    lastAttempt: now,
    error,
    createdAt: now,
  };

  queue.scans.push(queuedScan);
  writeQueue(projectRoot, queue);

  return queuedScan;
}

/**
 * Update a queued scan after a retry attempt
 */
export function updateQueuedScan(
  projectRoot: string,
  scanId: string,
  updates: Partial<Pick<QueuedScan, 'attempts' | 'lastAttempt' | 'error'>>
): void {
  const queue = readQueue(projectRoot);
  const scan = queue.scans.find((s) => s.id === scanId);

  if (scan) {
    Object.assign(scan, updates);
    writeQueue(projectRoot, queue);
  }
}

/**
 * Remove a scan from the queue (after successful upload)
 */
export function removeFromQueue(projectRoot: string, scanId: string): void {
  const queue = readQueue(projectRoot);
  queue.scans = queue.scans.filter((s) => s.id !== scanId);
  writeQueue(projectRoot, queue);
}

/**
 * Get pending scans that should be retried
 */
export function getPendingScans(projectRoot: string, maxAttempts = 5): QueuedScan[] {
  const queue = readQueue(projectRoot);
  return queue.scans.filter((s) => s.attempts < maxAttempts);
}

/**
 * Get count of queued scans
 */
export function getQueueCount(projectRoot: string): number {
  const queue = readQueue(projectRoot);
  return queue.scans.length;
}

/**
 * Clear all queued scans
 */
export function clearQueue(projectRoot: string): void {
  writeQueue(projectRoot, { scans: [] });
}

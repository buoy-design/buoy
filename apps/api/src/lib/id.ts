/**
 * ID Generation Utilities
 *
 * All IDs are prefixed for easy identification:
 * - acc_xxx: Account
 * - usr_xxx: User
 * - key_xxx: API Key
 * - inv_xxx: Invite
 * - ghi_xxx: GitHub Installation
 * - prj_xxx: Project (in tenant DB)
 * - scn_xxx: Scan (in tenant DB)
 */

import { nanoid } from 'nanoid';

type IdPrefix =
  | 'acc'
  | 'usr'
  | 'key'
  | 'inv'
  | 'ghi'
  | 'usg'
  | 'aud'
  | 'prj'
  | 'scn'
  | 'cmp'
  | 'tok'
  | 'dft';

/**
 * Generate a prefixed nanoid
 */
export function generateId(prefix: IdPrefix, length = 21): string {
  return `${prefix}_${nanoid(length)}`;
}

/**
 * Generate account ID
 */
export function accountId(): string {
  return generateId('acc');
}

/**
 * Generate user ID
 */
export function userId(): string {
  return generateId('usr');
}

/**
 * Generate API key ID
 */
export function apiKeyId(): string {
  return generateId('key');
}

/**
 * Generate invite ID
 */
export function inviteId(): string {
  return generateId('inv');
}

/**
 * Generate GitHub installation ID
 */
export function githubInstallationId(): string {
  return generateId('ghi');
}

/**
 * Generate usage record ID
 */
export function usageId(): string {
  return generateId('usg');
}

/**
 * Generate audit log ID
 */
export function auditLogId(): string {
  return generateId('aud');
}

/**
 * Generate project ID (tenant DB)
 */
export function projectId(): string {
  return generateId('prj');
}

/**
 * Generate a slug from a name
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

/**
 * Generate a unique slug by appending random suffix
 */
export function uniqueSlug(name: string): string {
  const base = slugify(name);
  const suffix = nanoid(6).toLowerCase();
  return `${base}-${suffix}`;
}

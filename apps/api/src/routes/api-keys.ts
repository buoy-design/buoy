/**
 * API Key Management Routes
 *
 * GET    /api-keys     - List API keys for account
 * POST   /api-keys     - Create new API key
 * DELETE /api-keys/:id - Revoke API key
 */

import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import type { Env, Variables } from '../env.js';
import * as schema from '../db/schema/index.js';
import { apiKeyId } from '../lib/id.js';

const apiKeys = new Hono<{ Bindings: Env; Variables: Variables }>();

// Validation schemas
const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional(),
  expiresIn: z.number().optional(), // days
});

/**
 * Generate a secure API key
 * Format: buoy_live_<account_prefix>_<32_random_bytes>
 */
function generateApiKey(accountSlug: string): { key: string; prefix: string } {
  const accountPrefix = accountSlug.substring(0, 8);
  const randomPart = nanoid(32);
  const key = `buoy_live_${accountPrefix}_${randomPart}`;
  const prefix = `buoy_live_${accountPrefix}_${randomPart.substring(0, 8)}`;
  return { key, prefix };
}

/**
 * Simple hash function for API key (in production, use bcrypt)
 * For Workers, we use SubtleCrypto
 */
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * List API keys for the current account
 */
apiKeys.get('/', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = drizzle(c.env.PLATFORM_DB, { schema });

  const keys = await db.query.apiKeys.findMany({
    where: and(
      eq(schema.apiKeys.accountId, session.accountId),
      // Only show non-revoked keys
    ),
    columns: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: (keys, { desc }) => [desc(keys.createdAt)],
  });

  // Filter out revoked keys
  const activeKeys = keys.filter((key) => {
    const keyData = key as typeof key & { revokedAt?: Date | null };
    return !keyData.revokedAt;
  });

  return c.json({ keys: activeKeys });
});

/**
 * Create a new API key
 */
apiKeys.post('/', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Only owner/admin can create keys
  if (!['owner', 'admin'].includes(session.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  let body: z.infer<typeof createKeySchema>;
  try {
    body = createKeySchema.parse(await c.req.json());
  } catch (error) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const db = drizzle(c.env.PLATFORM_DB, { schema });

  // Get account for slug
  const account = await db.query.accounts.findFirst({
    where: eq(schema.accounts.id, session.accountId),
  });

  if (!account) {
    return c.json({ error: 'Account not found' }, 404);
  }

  // Generate key
  const { key, prefix } = generateApiKey(account.slug);
  const keyHash = await hashApiKey(key);

  const now = new Date();
  const expiresAt = body.expiresIn
    ? new Date(now.getTime() + body.expiresIn * 24 * 60 * 60 * 1000)
    : null;

  const id = apiKeyId();

  await db.insert(schema.apiKeys).values({
    id,
    accountId: session.accountId,
    userId: session.userId,
    name: body.name,
    keyPrefix: prefix,
    keyHash,
    scopes: body.scopes ? JSON.stringify(body.scopes) : null,
    expiresAt,
    createdAt: now,
  });

  // Return the full key only once - user must save it
  return c.json(
    {
      id,
      name: body.name,
      key, // Full key - only shown once!
      prefix,
      scopes: body.scopes || [],
      expiresAt,
      createdAt: now,
    },
    201
  );
});

/**
 * Revoke an API key
 */
apiKeys.delete('/:id', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const keyId = c.req.param('id');

  const db = drizzle(c.env.PLATFORM_DB, { schema });

  // Find the key
  const key = await db.query.apiKeys.findFirst({
    where: and(
      eq(schema.apiKeys.id, keyId),
      eq(schema.apiKeys.accountId, session.accountId)
    ),
  });

  if (!key) {
    return c.json({ error: 'API key not found' }, 404);
  }

  // Only owner/admin can revoke, or the user who created it
  if (!['owner', 'admin'].includes(session.role) && key.userId !== session.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Soft delete - set revokedAt
  await db
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(schema.apiKeys.id, keyId));

  return c.json({ success: true });
});

export { apiKeys };

/**
 * Verify an API key (used by auth middleware)
 */
export async function verifyApiKey(
  db: ReturnType<typeof drizzle<typeof schema>>,
  key: string
): Promise<{ accountId: string; userId: string | null; scopes: string[] } | null> {
  // Hash the provided key
  const keyHash = await hashApiKey(key);

  // Find matching key
  const results = await db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyHash, keyHash))
    .limit(1);

  const apiKey = results[0];
  if (!apiKey) return null;

  // Check if revoked
  if (apiKey.revokedAt) return null;

  // Check if expired
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

  // Update last used
  await db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, apiKey.id));

  return {
    accountId: apiKey.accountId,
    userId: apiKey.userId,
    scopes: apiKey.scopes ? JSON.parse(apiKey.scopes) : [],
  };
}

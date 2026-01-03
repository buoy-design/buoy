/**
 * Authentication Middleware
 *
 * Supports two auth methods:
 * 1. Session cookie (for web dashboard)
 * 2. Bearer token (for CLI/API)
 */

import type { MiddlewareHandler } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import type { Env, Variables } from '../env.js';
import * as schema from '../db/schema/index.js';
import { getSession } from '../lib/session.js';
import { verifyApiKey } from '../routes/api-keys.js';

/**
 * Require authentication
 * Sets session data in context variables
 */
export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next
) => {
  // Try session cookie first
  const session = await getSession(c);
  if (session) {
    c.set('session', session);
    return next();
  }

  // Try Bearer token
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Skip if it looks like a session ID
    if (token.startsWith('sess_')) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    // Verify API key
    const db = drizzle(c.env.PLATFORM_DB, { schema });
    const result = await verifyApiKey(db, token);

    if (result) {
      c.set('session', {
        userId: result.userId || 'api_key',
        accountId: result.accountId,
        role: 'api', // API keys have special role
      });
      return next();
    }
  }

  return c.json({ error: 'Unauthorized' }, 401);
};

/**
 * Optional authentication - doesn't fail if not authenticated
 */
export const optionalAuth: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next
) => {
  // Try session cookie first
  const session = await getSession(c);
  if (session) {
    c.set('session', session);
    return next();
  }

  // Try Bearer token
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    if (!token.startsWith('sess_')) {
      const db = drizzle(c.env.PLATFORM_DB, { schema });
      const result = await verifyApiKey(db, token);

      if (result) {
        c.set('session', {
          userId: result.userId || 'api_key',
          accountId: result.accountId,
          role: 'api',
        });
      }
    }
  }

  return next();
};

/**
 * Require specific role
 */
export function requireRole(
  ...allowedRoles: string[]
): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const session = c.get('session');

    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    if (!allowedRoles.includes(session.role)) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    return next();
  };
}

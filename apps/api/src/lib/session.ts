/**
 * Session Management via Cloudflare KV
 *
 * Sessions are stored in KV with automatic TTL expiration.
 * Session ID is stored in an httpOnly cookie.
 */

import { nanoid } from 'nanoid';
import type { Context } from 'hono';
import type { Env, Variables } from '../env.js';

// Session TTL: 7 days
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

// Cookie settings
const COOKIE_NAME = 'buoy_session';

export interface Session {
  userId: string;
  accountId: string;
  role: string;
  githubLogin?: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Create a new session and set the cookie
 */
export async function createSession(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  data: Omit<Session, 'createdAt' | 'expiresAt'>
): Promise<string> {
  const sessionId = `sess_${nanoid(32)}`;
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;

  const session: Session = {
    ...data,
    createdAt: now,
    expiresAt,
  };

  // Store in KV
  await c.env.SESSIONS.put(sessionId, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  // Set cookie
  const isProduction = c.env.ENVIRONMENT === 'production';
  c.header(
    'Set-Cookie',
    [
      `${COOKIE_NAME}=${sessionId}`,
      'Path=/',
      `Max-Age=${SESSION_TTL_SECONDS}`,
      'HttpOnly',
      'SameSite=Lax',
      isProduction ? 'Secure' : '',
      isProduction ? 'Domain=.buoy.design' : '',
    ]
      .filter(Boolean)
      .join('; ')
  );

  return sessionId;
}

/**
 * Get the current session from cookie
 */
export async function getSession(
  c: Context<{ Bindings: Env; Variables: Variables }>
): Promise<Session | null> {
  const cookie = c.req.header('Cookie');
  if (!cookie) return null;

  const sessionId = parseCookie(cookie, COOKIE_NAME);
  if (!sessionId) return null;

  const sessionData = await c.env.SESSIONS.get(sessionId);
  if (!sessionData) return null;

  try {
    const session = JSON.parse(sessionData) as Session;

    // Check if expired (belt and suspenders with KV TTL)
    if (session.expiresAt < Date.now()) {
      await deleteSession(c);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Delete the current session
 */
export async function deleteSession(
  c: Context<{ Bindings: Env; Variables: Variables }>
): Promise<void> {
  const cookie = c.req.header('Cookie');
  if (!cookie) return;

  const sessionId = parseCookie(cookie, COOKIE_NAME);
  if (!sessionId) return;

  // Delete from KV
  await c.env.SESSIONS.delete(sessionId);

  // Clear cookie
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
  );
}

/**
 * Parse a specific cookie from the Cookie header
 */
function parseCookie(cookieHeader: string, name: string): string | null {
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    const [key, value] = cookie.split('=');
    if (key === name) {
      return value;
    }
  }
  return null;
}

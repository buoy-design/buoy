import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { developerInvites } from './developer-invites';
import type { Env, Variables } from '../env';

// Mock D1 database with configurable responses
function createMockDb() {
  let nextFirstResult: unknown = null;
  let nextAllResult: unknown[] = [];

  return {
    prepare: vi.fn((_sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        first: vi.fn(async () => nextFirstResult),
        all: vi.fn(async () => ({ results: nextAllResult })),
        run: vi.fn(async () => ({ meta: { changes: 1 } })),
      })),
    })),
    setNextFirst: (result: unknown) => {
      nextFirstResult = result;
    },
    setNextAll: (results: unknown[]) => {
      nextAllResult = results;
    },
  };
}

// Create a test app with mock bindings
function createTestApp(mockDb: ReturnType<typeof createMockDb>, session?: { userId: string; accountId: string; role: string }) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  // Add mock environment and session
  app.use('*', async (c, next) => {
    c.env = { PLATFORM_DB: mockDb, CORS_ORIGIN: 'http://localhost:3000' } as unknown as Env;
    if (session) {
      c.set('session', session);
    }
    await next();
  });

  app.route('/developer-invites', developerInvites);
  return app;
}

// Test types
interface InviteResponse {
  id: string;
  token: string;
  inviteUrl: string;
  expiresAt: string;
}

interface InviteDetailsResponse {
  valid: boolean;
  invitedBy: { name: string; email: string };
  accountName: string;
  message?: string;
  expiresAt: string;
}

interface AcceptResponse {
  success: boolean;
  message: string;
  dashboardUrl?: string;
}

describe('Developer Invites API Routes', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
  });

  describe('POST /developer-invites', () => {
    it('creates an invite when authenticated', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      // Mock user lookup for inviter details
      mockDb.setNextFirst({ id: 'usr_123', name: 'Alex Designer', email: 'alex@example.com' });

      const res = await app.request('/developer-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Please connect our repo!' }),
      });

      expect(res.status).toBe(201);
      const data = await res.json() as InviteResponse;
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('token');
      expect(data).toHaveProperty('inviteUrl');
      expect(data).toHaveProperty('expiresAt');
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb); // No session

      const res = await app.request('/developer-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(401);
    });

    it('accepts optional message field', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'member' };
      const app = createTestApp(mockDb, session);

      mockDb.setNextFirst({ name: 'Test User', email: 'test@example.com' });

      const res = await app.request('/developer-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hey, can you connect our marketing site repo?' }),
      });

      expect(res.status).toBe(201);
    });
  });

  describe('GET /developer-invites/:token', () => {
    it('returns invite details for valid token', async () => {
      const app = createTestApp(mockDb); // Public endpoint, no session needed

      // Mock finding the invite
      mockDb.setNextFirst({
        id: 'inv_123',
        token: 'abc123',
        status: 'pending',
        message: 'Please connect!',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        inviter_name: 'Alex Designer',
        inviter_email: 'alex@example.com',
        account_name: 'Acme Corp',
      });

      const res = await app.request('/developer-invites/abc123');
      expect(res.status).toBe(200);

      const data = await res.json() as InviteDetailsResponse;
      expect(data.valid).toBe(true);
      expect(data.invitedBy).toHaveProperty('name');
      expect(data.invitedBy).toHaveProperty('email');
      expect(data.accountName).toBe('Acme Corp');
    });

    it('returns 404 for invalid token', async () => {
      const app = createTestApp(mockDb);

      // Mock not finding the invite
      mockDb.setNextFirst(null);

      const res = await app.request('/developer-invites/invalid-token');
      expect(res.status).toBe(404);
    });

    it('returns 410 for expired invite', async () => {
      const app = createTestApp(mockDb);

      // Mock finding an expired invite
      mockDb.setNextFirst({
        id: 'inv_123',
        token: 'expired123',
        status: 'pending',
        expires_at: new Date(Date.now() - 86400000).toISOString(), // Expired yesterday
        inviter_name: 'Alex',
        inviter_email: 'alex@example.com',
        account_name: 'Acme',
      });

      const res = await app.request('/developer-invites/expired123');
      expect(res.status).toBe(410);
    });
  });

  describe('POST /developer-invites/:token/accept', () => {
    it('accepts invite and connects repo when authenticated', async () => {
      const session = { userId: 'usr_456', accountId: 'acc_456', role: 'owner' };
      const app = createTestApp(mockDb, session);

      // Mock finding valid invite
      mockDb.setNextFirst({
        id: 'inv_123',
        account_id: 'acc_123',
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });

      const res = await app.request('/developer-invites/abc123/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoFullName: 'acme/marketing-site' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as AcceptResponse;
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('dashboardUrl');
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb); // No session

      const res = await app.request('/developer-invites/abc123/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoFullName: 'acme/marketing-site' }),
      });

      expect(res.status).toBe(401);
    });

    it('returns 400 when repoFullName is missing', async () => {
      const session = { userId: 'usr_456', accountId: 'acc_456', role: 'owner' };
      const app = createTestApp(mockDb, session);

      const res = await app.request('/developer-invites/abc123/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('returns 404 for invalid token', async () => {
      const session = { userId: 'usr_456', accountId: 'acc_456', role: 'owner' };
      const app = createTestApp(mockDb, session);

      // Mock not finding the invite
      mockDb.setNextFirst(null);

      const res = await app.request('/developer-invites/invalid/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoFullName: 'acme/site' }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 410 for already accepted invite', async () => {
      const session = { userId: 'usr_456', accountId: 'acc_456', role: 'owner' };
      const app = createTestApp(mockDb, session);

      // Mock finding already accepted invite
      mockDb.setNextFirst({
        id: 'inv_123',
        account_id: 'acc_123',
        status: 'accepted',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });

      const res = await app.request('/developer-invites/abc123/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoFullName: 'acme/site' }),
      });

      expect(res.status).toBe(410);
    });
  });

  describe('GET /developer-invites', () => {
    it('lists invites for authenticated user', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      // Mock returning invites list
      mockDb.setNextAll([
        { id: 'inv_1', status: 'pending', created_at: new Date().toISOString() },
        { id: 'inv_2', status: 'accepted', created_at: new Date().toISOString() },
      ]);

      const res = await app.request('/developer-invites');
      expect(res.status).toBe(200);

      const data = await res.json() as { invites: unknown[] };
      expect(data).toHaveProperty('invites');
      expect(Array.isArray(data.invites)).toBe(true);
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb);

      const res = await app.request('/developer-invites');
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /developer-invites/:id', () => {
    it('revokes invite when authenticated as owner', async () => {
      const session = { userId: 'usr_123', accountId: 'acc_123', role: 'owner' };
      const app = createTestApp(mockDb, session);

      const res = await app.request('/developer-invites/inv_123', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
    });

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp(mockDb);

      const res = await app.request('/developer-invites/inv_123', {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
    });
  });
});

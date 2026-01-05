/**
 * Developer Invite Routes
 *
 * Enables designers to invite developers to connect their GitHub repo.
 * This is different from team invites - it's about connecting a repo,
 * not adding a team member.
 *
 * POST   /developer-invites              - Create invite
 * GET    /developer-invites              - List invites for account
 * GET    /developer-invites/:token       - Get invite details (public)
 * POST   /developer-invites/:token/accept - Accept invite and connect repo
 * DELETE /developer-invites/:id          - Revoke invite
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { Env, Variables } from '../env.js';

export const developerInvites = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateInviteSchema = z.object({
  message: z.string().max(500).optional(),
});

const AcceptInviteSchema = z.object({
  repoFullName: z.string().min(1), // e.g., "owner/repo"
});

// ============================================================================
// Routes
// ============================================================================

/**
 * Create a developer invite
 */
developerInvites.post('/', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateInviteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
  }

  const db = c.env.PLATFORM_DB;
  const inviteId = `devinv_${nanoid(12)}`;
  const token = nanoid(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  try {
    // Get inviter details for the invite
    const inviter = await db
      .prepare('SELECT name, email FROM users WHERE id = ?')
      .bind(session.userId)
      .first<{ name: string; email: string }>();

    await db
      .prepare(
        `
        INSERT INTO developer_invites (id, account_id, invited_by, token, message, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      `
      )
      .bind(
        inviteId,
        session.accountId,
        session.userId,
        token,
        parsed.data.message || null,
        now.toISOString(),
        expiresAt.toISOString()
      )
      .run();

    const baseUrl = c.env.CORS_ORIGIN || 'https://app.buoy.design';
    const inviteUrl = `${baseUrl}/connect/${token}`;

    return c.json(
      {
        id: inviteId,
        token,
        inviteUrl,
        expiresAt: expiresAt.toISOString(),
        invitedBy: inviter?.name || 'A team member',
      },
      201
    );
  } catch (error) {
    console.error('Error creating developer invite:', error);
    return c.json({ error: 'Failed to create invite' }, 500);
  }
});

/**
 * List developer invites for the current account
 */
developerInvites.get('/', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const db = c.env.PLATFORM_DB;

  try {
    const result = await db
      .prepare(
        `
        SELECT
          di.id, di.token, di.message, di.status, di.repo_connected,
          di.created_at, di.expires_at, di.accepted_at,
          u.name as invited_by_name, u.email as invited_by_email,
          au.name as accepted_by_name
        FROM developer_invites di
        LEFT JOIN users u ON di.invited_by = u.id
        LEFT JOIN users au ON di.accepted_by = au.id
        WHERE di.account_id = ?
        ORDER BY di.created_at DESC
        LIMIT 50
      `
      )
      .bind(session.accountId)
      .all();

    const invites = (result.results || []).map((row) => ({
      id: row.id,
      status: row.status,
      message: row.message,
      repoConnected: row.repo_connected,
      invitedBy: {
        name: row.invited_by_name,
        email: row.invited_by_email,
      },
      acceptedBy: row.accepted_by_name ? { name: row.accepted_by_name } : null,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
    }));

    return c.json({ invites });
  } catch (error) {
    console.error('Error listing developer invites:', error);
    return c.json({ error: 'Failed to list invites' }, 500);
  }
});

/**
 * Get invite details by token (public endpoint for landing page)
 */
developerInvites.get('/:token', async (c) => {
  const token = c.req.param('token');
  const db = c.env.PLATFORM_DB;

  try {
    const invite = await db
      .prepare(
        `
        SELECT
          di.id, di.account_id, di.message, di.status, di.expires_at,
          u.name as inviter_name, u.email as inviter_email,
          a.name as account_name
        FROM developer_invites di
        JOIN users u ON di.invited_by = u.id
        JOIN accounts a ON di.account_id = a.id
        WHERE di.token = ?
      `
      )
      .bind(token)
      .first<{
        id: string;
        account_id: string;
        message: string | null;
        status: string;
        expires_at: string;
        inviter_name: string;
        inviter_email: string;
        account_name: string;
      }>();

    if (!invite) {
      return c.json({ error: 'Invite not found' }, 404);
    }

    // Check if expired
    if (new Date(invite.expires_at) < new Date()) {
      return c.json({ error: 'Invite has expired', valid: false }, 410);
    }

    // Check if already accepted
    if (invite.status === 'accepted') {
      return c.json({ error: 'Invite has already been used', valid: false }, 410);
    }

    return c.json({
      valid: true,
      invitedBy: {
        name: invite.inviter_name,
        email: invite.inviter_email,
      },
      accountName: invite.account_name,
      message: invite.message,
      expiresAt: invite.expires_at,
    });
  } catch (error) {
    console.error('Error getting developer invite:', error);
    return c.json({ error: 'Failed to get invite' }, 500);
  }
});

/**
 * Accept invite and connect repo
 */
developerInvites.post('/:token/accept', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized - please authenticate with GitHub first' }, 401);
  }

  const token = c.req.param('token');
  const body = await c.req.json().catch(() => ({}));

  const parsed = AcceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'repoFullName is required', details: parsed.error.issues }, 400);
  }

  const db = c.env.PLATFORM_DB;
  const { repoFullName } = parsed.data;

  try {
    // Find the invite
    const invite = await db
      .prepare(
        `
        SELECT id, account_id, status, expires_at
        FROM developer_invites
        WHERE token = ?
      `
      )
      .bind(token)
      .first<{
        id: string;
        account_id: string;
        status: string;
        expires_at: string;
      }>();

    if (!invite) {
      return c.json({ error: 'Invite not found' }, 404);
    }

    // Check if expired
    if (new Date(invite.expires_at) < new Date()) {
      return c.json({ error: 'Invite has expired' }, 410);
    }

    // Check if already accepted
    if (invite.status !== 'pending') {
      return c.json({ error: 'Invite has already been used' }, 410);
    }

    // Update the invite
    const now = new Date().toISOString();
    await db
      .prepare(
        `
        UPDATE developer_invites
        SET status = 'accepted', accepted_by = ?, accepted_at = ?, repo_connected = ?
        WHERE id = ?
      `
      )
      .bind(session.userId, now, repoFullName, invite.id)
      .run();

    // TODO: Trigger first scan for the connected repo
    // This would queue a scan job for the repo

    const baseUrl = c.env.CORS_ORIGIN || 'https://app.buoy.design';

    return c.json({
      success: true,
      message: `Connected ${repoFullName} successfully`,
      dashboardUrl: `${baseUrl}/dashboard`,
      repoConnected: repoFullName,
    });
  } catch (error) {
    console.error('Error accepting developer invite:', error);
    return c.json({ error: 'Failed to accept invite' }, 500);
  }
});

/**
 * Revoke/delete an invite
 */
developerInvites.delete('/:id', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const inviteId = c.req.param('id');
  const db = c.env.PLATFORM_DB;

  try {
    const result = await db
      .prepare('DELETE FROM developer_invites WHERE id = ? AND account_id = ?')
      .bind(inviteId, session.accountId)
      .run();

    if (!result.meta?.changes) {
      return c.json({ error: 'Invite not found' }, 404);
    }

    return c.json({ success: true, message: 'Invite revoked' });
  } catch (error) {
    console.error('Error revoking developer invite:', error);
    return c.json({ error: 'Failed to revoke invite' }, 500);
  }
});

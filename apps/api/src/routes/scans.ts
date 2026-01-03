/**
 * Scan Upload Routes
 *
 * POST   /projects/:id/scans           - Upload scan results
 * GET    /projects/:id/scans           - List scans
 * GET    /projects/:id/scans/latest    - Get latest scan
 * GET    /projects/:id/scans/:scanId   - Get specific scan
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { Env, Variables } from '../env.js';

const scans = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================================
// Validation Schemas
// ============================================================================

const componentSchema = z.object({
  name: z.string(),
  path: z.string(),
  framework: z.string().optional(),
  props: z.array(z.object({
    name: z.string(),
    type: z.string().optional(),
    required: z.boolean().optional(),
    defaultValue: z.unknown().optional(),
  })).optional(),
  imports: z.array(z.string()).optional(),
  loc: z.number().optional(),
});

const tokenSchema = z.object({
  name: z.string(),
  value: z.string(),
  type: z.string(), // color, spacing, typography, etc.
  path: z.string().optional(),
  source: z.string().optional(), // css, json, figma
});

const driftSignalSchema = z.object({
  type: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  file: z.string().optional(),
  line: z.number().optional(),
  component: z.string().optional(),
  token: z.string().optional(),
  suggestion: z.string().optional(),
});

const uploadScanSchema = z.object({
  // Metadata
  commitSha: z.string().optional(),
  branch: z.string().optional(),
  author: z.string().optional(),
  timestamp: z.string().optional(),

  // Scan data
  components: z.array(componentSchema).default([]),
  tokens: z.array(tokenSchema).default([]),
  drift: z.array(driftSignalSchema).default([]),

  // Summary stats
  summary: z.object({
    totalComponents: z.number(),
    totalTokens: z.number(),
    totalDrift: z.number(),
    driftByType: z.record(z.number()).optional(),
    driftBySeverity: z.record(z.number()).optional(),
  }).optional(),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * Upload scan results
 */
scans.post('/:projectId/scans', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const projectId = c.req.param('projectId');

  // Verify project belongs to account
  const project = await c.env.PLATFORM_DB.prepare(`
    SELECT id FROM projects WHERE id = ? AND account_id = ?
  `).bind(projectId, session.accountId).first();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Parse and validate body
  let body: z.infer<typeof uploadScanSchema>;
  try {
    const rawBody = await c.req.json();
    body = uploadScanSchema.parse(rawBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid scan data', details: error.errors }, 400);
    }
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const scanId = `scn_${nanoid(21)}`;
  const now = new Date().toISOString();

  // Calculate summary if not provided
  const summary = body.summary || {
    totalComponents: body.components.length,
    totalTokens: body.tokens.length,
    totalDrift: body.drift.length,
    driftByType: body.drift.reduce((acc, d) => {
      acc[d.type] = (acc[d.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    driftBySeverity: body.drift.reduce((acc, d) => {
      acc[d.severity] = (acc[d.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  try {
    // Insert scan record
    await c.env.PLATFORM_DB.prepare(`
      INSERT INTO scans (
        id, project_id, account_id,
        commit_sha, branch, author,
        components_count, tokens_count, drift_count,
        summary, components_data, tokens_data, drift_data,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      scanId,
      projectId,
      session.accountId,
      body.commitSha || null,
      body.branch || null,
      body.author || null,
      body.components.length,
      body.tokens.length,
      body.drift.length,
      JSON.stringify(summary),
      JSON.stringify(body.components),
      JSON.stringify(body.tokens),
      JSON.stringify(body.drift),
      body.timestamp || now,
    ).run();

    // Update project's last scan timestamp
    await c.env.PLATFORM_DB.prepare(`
      UPDATE projects SET updated_at = ? WHERE id = ?
    `).bind(now, projectId).run();

    // Update usage tracking
    const period = now.substring(0, 7); // YYYY-MM
    await c.env.PLATFORM_DB.prepare(`
      INSERT INTO usage (id, account_id, period, scans_count, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT (account_id, period) DO UPDATE SET
        scans_count = scans_count + 1,
        updated_at = ?
    `).bind(
      `usg_${nanoid(21)}`,
      session.accountId,
      period,
      now,
      now,
    ).run();

    return c.json({
      id: scanId,
      projectId,
      summary,
      createdAt: now,
    }, 201);
  } catch (error) {
    console.error('Error uploading scan:', error);
    return c.json({ error: 'Failed to upload scan' }, 500);
  }
});

/**
 * List scans for a project
 */
scans.get('/:projectId/scans', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const projectId = c.req.param('projectId');
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  // Verify project belongs to account
  const project = await c.env.PLATFORM_DB.prepare(`
    SELECT id FROM projects WHERE id = ? AND account_id = ?
  `).bind(projectId, session.accountId).first();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  try {
    const result = await c.env.PLATFORM_DB.prepare(`
      SELECT
        id, commit_sha, branch, author,
        components_count, tokens_count, drift_count,
        summary, created_at
      FROM scans
      WHERE project_id = ? AND account_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(projectId, session.accountId, limit, offset).all();

    const scans = result.results?.map((row) => ({
      id: row.id,
      commitSha: row.commit_sha,
      branch: row.branch,
      author: row.author,
      componentsCount: row.components_count,
      tokensCount: row.tokens_count,
      driftCount: row.drift_count,
      summary: row.summary ? JSON.parse(row.summary as string) : null,
      createdAt: row.created_at,
    })) || [];

    // Get total count
    const countResult = await c.env.PLATFORM_DB.prepare(`
      SELECT COUNT(*) as total FROM scans WHERE project_id = ? AND account_id = ?
    `).bind(projectId, session.accountId).first();

    return c.json({
      scans,
      total: countResult?.total || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing scans:', error);
    return c.json({ error: 'Failed to list scans' }, 500);
  }
});

/**
 * Get latest scan for a project
 */
scans.get('/:projectId/scans/latest', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const projectId = c.req.param('projectId');
  const includeData = c.req.query('include') === 'full';

  // Verify project belongs to account
  const project = await c.env.PLATFORM_DB.prepare(`
    SELECT id FROM projects WHERE id = ? AND account_id = ?
  `).bind(projectId, session.accountId).first();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  try {
    const columns = includeData
      ? '*'
      : 'id, commit_sha, branch, author, components_count, tokens_count, drift_count, summary, created_at';

    const scan = await c.env.PLATFORM_DB.prepare(`
      SELECT ${columns}
      FROM scans
      WHERE project_id = ? AND account_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(projectId, session.accountId).first();

    if (!scan) {
      return c.json({ error: 'No scans found' }, 404);
    }

    const result: Record<string, unknown> = {
      id: scan.id,
      commitSha: scan.commit_sha,
      branch: scan.branch,
      author: scan.author,
      componentsCount: scan.components_count,
      tokensCount: scan.tokens_count,
      driftCount: scan.drift_count,
      summary: scan.summary ? JSON.parse(scan.summary as string) : null,
      createdAt: scan.created_at,
    };

    if (includeData) {
      result.components = scan.components_data ? JSON.parse(scan.components_data as string) : [];
      result.tokens = scan.tokens_data ? JSON.parse(scan.tokens_data as string) : [];
      result.drift = scan.drift_data ? JSON.parse(scan.drift_data as string) : [];
    }

    return c.json(result);
  } catch (error) {
    console.error('Error getting latest scan:', error);
    return c.json({ error: 'Failed to get scan' }, 500);
  }
});

/**
 * Get specific scan by ID
 */
scans.get('/:projectId/scans/:scanId', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const projectId = c.req.param('projectId');
  const scanId = c.req.param('scanId');
  const includeData = c.req.query('include') === 'full';

  try {
    const columns = includeData
      ? '*'
      : 'id, commit_sha, branch, author, components_count, tokens_count, drift_count, summary, created_at';

    const scan = await c.env.PLATFORM_DB.prepare(`
      SELECT ${columns}
      FROM scans
      WHERE id = ? AND project_id = ? AND account_id = ?
    `).bind(scanId, projectId, session.accountId).first();

    if (!scan) {
      return c.json({ error: 'Scan not found' }, 404);
    }

    const result: Record<string, unknown> = {
      id: scan.id,
      commitSha: scan.commit_sha,
      branch: scan.branch,
      author: scan.author,
      componentsCount: scan.components_count,
      tokensCount: scan.tokens_count,
      driftCount: scan.drift_count,
      summary: scan.summary ? JSON.parse(scan.summary as string) : null,
      createdAt: scan.created_at,
    };

    if (includeData) {
      result.components = scan.components_data ? JSON.parse(scan.components_data as string) : [];
      result.tokens = scan.tokens_data ? JSON.parse(scan.tokens_data as string) : [];
      result.drift = scan.drift_data ? JSON.parse(scan.drift_data as string) : [];
    }

    return c.json(result);
  } catch (error) {
    console.error('Error getting scan:', error);
    return c.json({ error: 'Failed to get scan' }, 500);
  }
});

export { scans };

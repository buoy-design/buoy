/**
 * Project Management Routes
 *
 * Projects are stored in tenant databases, not the central platform DB.
 * These routes handle CRUD operations via the tenant database binding.
 *
 * GET    /projects           - List projects
 * POST   /projects           - Create project
 * GET    /projects/:id       - Get project
 * PATCH  /projects/:id       - Update project
 * DELETE /projects/:id       - Delete project
 * GET    /projects/:id/events - SSE for real-time updates
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from '../env.js';
import { projectId } from '../lib/id.js';

const projects = new Hono<{ Bindings: Env; Variables: Variables }>();

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  repoUrl: z.string().url().optional(),
  defaultBranch: z.string().default('main'),
  settings: z
    .object({
      autoScan: z.boolean().default(true),
      prComments: z.boolean().default(true),
      checkRuns: z.boolean().default(true),
    })
    .optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  settings: z
    .object({
      autoScan: z.boolean().optional(),
      prComments: z.boolean().optional(),
      checkRuns: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Get tenant database for the current account
 *
 * NOTE: In production, this would dynamically bind to the correct tenant DB.
 * For now, we use the platform DB with account_id filtering.
 * Full multi-tenant isolation requires dynamic D1 binding which needs
 * a separate dispatch mechanism.
 */
function getTenantDb(accountId: string) {
  // TODO: Implement dynamic tenant DB binding
  // For now, return null - projects will be stored in platform DB with account filtering
  return null;
}

/**
 * List projects for the current account
 */
projects.get('/', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // For MVP, query projects directly from D1 with raw SQL
  // In full implementation, this would use the tenant DB
  const stmt = c.env.PLATFORM_DB.prepare(`
    SELECT id, name, repo_url, default_branch, settings, created_at, updated_at
    FROM projects
    WHERE account_id = ?
    ORDER BY updated_at DESC
  `);

  try {
    const result = await stmt.bind(session.accountId).all();
    return c.json({
      projects: result.results?.map((row) => ({
        id: row.id,
        name: row.name,
        repoUrl: row.repo_url,
        defaultBranch: row.default_branch,
        settings: row.settings ? JSON.parse(row.settings as string) : {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })) || [],
    });
  } catch (error) {
    // Table might not exist yet - return empty list
    console.error('Error listing projects:', error);
    return c.json({ projects: [] });
  }
});

/**
 * Create a new project
 */
projects.post('/', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: z.infer<typeof createProjectSchema>;
  try {
    body = createProjectSchema.parse(await c.req.json());
  } catch (error) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const id = projectId();
  const now = new Date().toISOString();
  const settings = JSON.stringify(body.settings || {});

  const stmt = c.env.PLATFORM_DB.prepare(`
    INSERT INTO projects (id, account_id, name, repo_url, default_branch, settings, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    await stmt
      .bind(
        id,
        session.accountId,
        body.name,
        body.repoUrl || null,
        body.defaultBranch,
        settings,
        now,
        now
      )
      .run();

    return c.json(
      {
        id,
        name: body.name,
        repoUrl: body.repoUrl,
        defaultBranch: body.defaultBranch,
        settings: body.settings || {},
        createdAt: now,
        updatedAt: now,
      },
      201
    );
  } catch (error) {
    console.error('Error creating project:', error);
    return c.json({ error: 'Failed to create project' }, 500);
  }
});

/**
 * Get a single project
 */
projects.get('/:id', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const projectIdParam = c.req.param('id');

  const stmt = c.env.PLATFORM_DB.prepare(`
    SELECT id, name, repo_url, default_branch, settings, created_at, updated_at
    FROM projects
    WHERE id = ? AND account_id = ?
  `);

  try {
    const result = await stmt.bind(projectIdParam, session.accountId).first();

    if (!result) {
      return c.json({ error: 'Project not found' }, 404);
    }

    return c.json({
      id: result.id,
      name: result.name,
      repoUrl: result.repo_url,
      defaultBranch: result.default_branch,
      settings: result.settings ? JSON.parse(result.settings as string) : {},
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    });
  } catch (error) {
    console.error('Error getting project:', error);
    return c.json({ error: 'Failed to get project' }, 500);
  }
});

/**
 * Update a project
 */
projects.patch('/:id', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const projectIdParam = c.req.param('id');

  let body: z.infer<typeof updateProjectSchema>;
  try {
    body = updateProjectSchema.parse(await c.req.json());
  } catch (error) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  // Build update query dynamically
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.name) {
    updates.push('name = ?');
    values.push(body.name);
  }

  if (body.settings) {
    updates.push('settings = ?');
    values.push(JSON.stringify(body.settings));
  }

  if (updates.length === 0) {
    return c.json({ error: 'No updates provided' }, 400);
  }

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());

  // Add WHERE conditions
  values.push(projectIdParam);
  values.push(session.accountId);

  const stmt = c.env.PLATFORM_DB.prepare(`
    UPDATE projects
    SET ${updates.join(', ')}
    WHERE id = ? AND account_id = ?
  `);

  try {
    const result = await stmt.bind(...values).run();

    if (!result.success || (result.meta?.changes ?? 0) === 0) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Fetch updated project
    const project = await c.env.PLATFORM_DB.prepare(`
      SELECT id, name, repo_url, default_branch, settings, created_at, updated_at
      FROM projects
      WHERE id = ? AND account_id = ?
    `)
      .bind(projectIdParam, session.accountId)
      .first();

    return c.json({
      id: project?.id,
      name: project?.name,
      repoUrl: project?.repo_url,
      defaultBranch: project?.default_branch,
      settings: project?.settings ? JSON.parse(project.settings as string) : {},
      createdAt: project?.created_at,
      updatedAt: project?.updated_at,
    });
  } catch (error) {
    console.error('Error updating project:', error);
    return c.json({ error: 'Failed to update project' }, 500);
  }
});

/**
 * Delete a project
 */
projects.delete('/:id', async (c) => {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Only owner/admin can delete projects
  if (!['owner', 'admin'].includes(session.role) && session.role !== 'api') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const projectIdParam = c.req.param('id');

  const stmt = c.env.PLATFORM_DB.prepare(`
    DELETE FROM projects
    WHERE id = ? AND account_id = ?
  `);

  try {
    const result = await stmt.bind(projectIdParam, session.accountId).run();

    if (!result.success || (result.meta?.changes ?? 0) === 0) {
      return c.json({ error: 'Project not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return c.json({ error: 'Failed to delete project' }, 500);
  }
});

export { projects };

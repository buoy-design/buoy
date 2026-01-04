/**
 * Plan Enforcement Middleware
 *
 * Checks if the account has access to specific features based on their plan.
 * Also enforces grace period restrictions for past-due payments.
 */

import type { Context, Next } from 'hono';
import type { Env, Variables } from '../env.js';
import { PLANS, GRACE_PERIOD } from '../routes/billing.js';

// Feature flags by plan
const PLAN_FEATURES = {
  free: new Set([
    'scan:read',
    'scan:write',
    'project:read',
    'project:create',
    'drift:read',
  ]),
  pro: new Set([
    // All free features
    'scan:read',
    'scan:write',
    'project:read',
    'project:create',
    'drift:read',
    // Pro features
    'drift:trends',
    'drift:resolve',
    'github:connect',
    'github:checkruns',
    'figma:sync',
    'team:invite',
    'team:unlimited',
    'events:stream',
    'export:all',
  ]),
  enterprise: new Set([
    // All pro features plus
    'scan:read',
    'scan:write',
    'project:read',
    'project:create',
    'drift:read',
    'drift:trends',
    'drift:resolve',
    'github:connect',
    'github:checkruns',
    'figma:sync',
    'team:invite',
    'team:unlimited',
    'events:stream',
    'export:all',
    // Enterprise features
    'sso:configure',
    'audit:export',
    'api:unlimited',
  ]),
} as const;

type Plan = keyof typeof PLAN_FEATURES;
type Feature = string;

interface AccountStatus {
  plan: Plan;
  paymentStatus: 'active' | 'past_due' | 'unpaid';
  graceEndsAt: Date | null;
  graceDaysRemaining: number | null;
}

/**
 * Get account status from database
 */
async function getAccountStatus(
  db: D1Database,
  accountId: string
): Promise<AccountStatus | null> {
  const account = await db.prepare(`
    SELECT plan, payment_status, grace_period_ends_at
    FROM accounts
    WHERE id = ?
  `).bind(accountId).first();

  if (!account) {
    return null;
  }

  const graceEndsAt = account.grace_period_ends_at
    ? new Date(account.grace_period_ends_at as string)
    : null;

  let graceDaysRemaining: number | null = null;
  if (graceEndsAt) {
    graceDaysRemaining = Math.ceil(
      (graceEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
  }

  return {
    plan: account.plan as Plan,
    paymentStatus: account.payment_status as 'active' | 'past_due' | 'unpaid',
    graceEndsAt,
    graceDaysRemaining,
  };
}

/**
 * Check if a plan has access to a feature
 */
function hasFeature(plan: Plan, feature: Feature): boolean {
  const features = PLAN_FEATURES[plan];
  return features?.has(feature) ?? false;
}

/**
 * Get grace period restrictions
 */
function getGraceRestrictions(graceDaysRemaining: number | null): {
  canCreateProjects: boolean;
  canInviteMembers: boolean;
  canWrite: boolean;
  isSuspended: boolean;
} {
  if (graceDaysRemaining === null || graceDaysRemaining > GRACE_PERIOD.SUSPENDED) {
    return {
      canCreateProjects: true,
      canInviteMembers: true,
      canWrite: true,
      isSuspended: false,
    };
  }

  const daysIntoGrace = GRACE_PERIOD.SUSPENDED - graceDaysRemaining;

  return {
    // Days 1-3: Full access
    // Days 4-7: No new projects/members
    canCreateProjects: daysIntoGrace <= GRACE_PERIOD.WARNING,
    canInviteMembers: daysIntoGrace <= GRACE_PERIOD.WARNING,
    // Days 8-14: Read-only
    canWrite: daysIntoGrace <= GRACE_PERIOD.LIMITED,
    // Day 15+: Suspended
    isSuspended: daysIntoGrace >= GRACE_PERIOD.SUSPENDED,
  };
}

/**
 * Middleware factory: Require a specific feature
 */
export function requireFeature(feature: Feature) {
  return async (
    c: Context<{ Bindings: Env; Variables: Variables }>,
    next: Next
  ) => {
    const session = c.get('session');
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const status = await getAccountStatus(c.env.PLATFORM_DB, session.accountId);
    if (!status) {
      return c.json({ error: 'Account not found' }, 404);
    }

    // Check if suspended
    const restrictions = getGraceRestrictions(status.graceDaysRemaining);
    if (restrictions.isSuspended) {
      return c.json(
        {
          error: 'Account suspended',
          message: 'Your account has been suspended due to unpaid invoices. Please update your payment method.',
          code: 'ACCOUNT_SUSPENDED',
        },
        402
      );
    }

    // Check plan access
    if (!hasFeature(status.plan, feature)) {
      const requiredPlan = Object.entries(PLAN_FEATURES).find(([, features]) =>
        features.has(feature)
      )?.[0];

      return c.json(
        {
          error: 'Feature not available',
          message: `This feature requires the ${requiredPlan || 'Pro'} plan.`,
          code: 'PLAN_REQUIRED',
          currentPlan: status.plan,
          requiredPlan,
        },
        403
      );
    }

    // Check grace period restrictions for write operations
    if (feature.endsWith(':write') || feature.endsWith(':create')) {
      if (!restrictions.canWrite) {
        return c.json(
          {
            error: 'Account read-only',
            message: 'Your account is in read-only mode due to payment issues. Please update your payment method.',
            code: 'READ_ONLY_MODE',
            graceDaysRemaining: status.graceDaysRemaining,
          },
          402
        );
      }
    }

    // Check project creation restriction
    if (feature === 'project:create' && !restrictions.canCreateProjects) {
      return c.json(
        {
          error: 'Cannot create projects',
          message: 'New projects cannot be created while your payment is past due.',
          code: 'PAYMENT_REQUIRED',
          graceDaysRemaining: status.graceDaysRemaining,
        },
        402
      );
    }

    // Check invite restriction
    if (feature === 'team:invite' && !restrictions.canInviteMembers) {
      return c.json(
        {
          error: 'Cannot invite members',
          message: 'New members cannot be invited while your payment is past due.',
          code: 'PAYMENT_REQUIRED',
          graceDaysRemaining: status.graceDaysRemaining,
        },
        402
      );
    }

    await next();
  };
}

/**
 * Middleware: Require Pro plan
 */
export const requirePro = requireFeature('drift:trends');

/**
 * Middleware: Require Enterprise plan
 */
export const requireEnterprise = requireFeature('sso:configure');

/**
 * Middleware: Check user limit before adding team members
 */
export async function checkUserLimit(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next
) {
  const session = c.get('session');
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const account = await c.env.PLATFORM_DB.prepare(`
    SELECT plan, user_limit FROM accounts WHERE id = ?
  `).bind(session.accountId).first();

  if (!account) {
    return c.json({ error: 'Account not found' }, 404);
  }

  // Pro and Enterprise have unlimited users
  if (account.plan === 'pro' || account.plan === 'enterprise') {
    await next();
    return;
  }

  // Check current user count
  const userCount = await c.env.PLATFORM_DB.prepare(`
    SELECT COUNT(*) as count FROM users WHERE account_id = ?
  `).bind(session.accountId).first();

  const pendingInvites = await c.env.PLATFORM_DB.prepare(`
    SELECT COUNT(*) as count FROM invites
    WHERE account_id = ? AND expires_at > datetime('now')
  `).bind(session.accountId).first();

  const totalUsers = ((userCount?.count as number) || 0) + ((pendingInvites?.count as number) || 0);
  const limit = account.user_limit as number;

  if (totalUsers >= limit) {
    return c.json(
      {
        error: 'User limit reached',
        message: `Your plan allows up to ${limit} users. Upgrade to Pro for unlimited users.`,
        code: 'USER_LIMIT_REACHED',
        currentUsers: totalUsers,
        limit,
      },
      403
    );
  }

  await next();
}

/**
 * Add payment status headers to response
 */
export async function addPaymentHeaders(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next
) {
  const session = c.get('session');

  await next();

  if (!session) {
    return;
  }

  const status = await getAccountStatus(c.env.PLATFORM_DB, session.accountId);
  if (!status) {
    return;
  }

  // Add headers for client-side payment status display
  if (status.paymentStatus !== 'active') {
    c.header('X-Buoy-Payment-Status', status.paymentStatus);
    if (status.graceDaysRemaining !== null) {
      c.header('X-Buoy-Grace-Days', String(status.graceDaysRemaining));
    }
  }

  c.header('X-Buoy-Plan', status.plan);
}

export { hasFeature, getGraceRestrictions, PLAN_FEATURES };

-- Buoy Platform Initial Schema
-- This creates the central platform database tables

-- Accounts (organizations/teams)
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',

  -- Stripe
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,

  -- Limits
  user_limit INTEGER DEFAULT 3,

  -- Trial
  trial_started_at INTEGER,
  trial_ends_at INTEGER,
  trial_converted INTEGER,

  -- Payment status
  payment_status TEXT DEFAULT 'active',
  payment_failed_at INTEGER,
  grace_period_ends_at INTEGER,

  -- Cancellation
  cancellation_requested_at INTEGER,
  cancellation_reason TEXT,
  canceled_at INTEGER,

  -- Tenant DB reference
  tenant_db_name TEXT NOT NULL,

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS accounts_slug_idx ON accounts(slug);
CREATE INDEX IF NOT EXISTS accounts_stripe_customer_idx ON accounts(stripe_customer_id);
CREATE INDEX IF NOT EXISTS accounts_plan_idx ON accounts(plan);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,

  -- GitHub OAuth
  github_id TEXT,
  github_login TEXT,
  github_access_token TEXT,

  -- Role
  role TEXT NOT NULL DEFAULT 'member',

  -- Status
  status TEXT NOT NULL DEFAULT 'active',

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS users_github_id_idx ON users(github_id);
CREATE INDEX IF NOT EXISTS users_account_id_idx ON users(account_id);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,

  scopes TEXT,

  last_used_at INTEGER,
  last_used_ip TEXT,

  expires_at INTEGER,
  revoked_at INTEGER,

  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS api_keys_account_id_idx ON api_keys(account_id);
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_prefix_idx ON api_keys(key_prefix);

-- Invites
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,

  token TEXT NOT NULL UNIQUE,

  status TEXT NOT NULL DEFAULT 'pending',
  accepted_at INTEGER,
  accepted_by TEXT REFERENCES users(id),

  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS invites_account_id_idx ON invites(account_id);
CREATE INDEX IF NOT EXISTS invites_email_idx ON invites(email);
CREATE UNIQUE INDEX IF NOT EXISTS invites_token_idx ON invites(token);

-- GitHub Installations
CREATE TABLE IF NOT EXISTS github_installations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  installation_id INTEGER NOT NULL,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_avatar_url TEXT,

  access_token TEXT,
  token_expires_at INTEGER,

  repository_selection TEXT,
  selected_repositories TEXT,

  suspended_at INTEGER,
  suspended_by TEXT,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS github_installations_account_id_idx ON github_installations(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS github_installations_installation_id_idx ON github_installations(installation_id);

-- Usage tracking
CREATE TABLE IF NOT EXISTS usage (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  period TEXT NOT NULL,

  scans_count INTEGER DEFAULT 0,
  api_calls_count INTEGER DEFAULT 0,
  storage_bytes INTEGER DEFAULT 0,
  pr_comments_count INTEGER DEFAULT 0,
  check_runs_count INTEGER DEFAULT 0,

  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_account_period_idx ON usage(account_id, period);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,

  metadata TEXT,

  ip_address TEXT,
  user_agent TEXT,

  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_logs_account_id_idx ON audit_logs(account_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at);

-- Projects (stored in platform DB for MVP, later moves to tenant DBs)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  repo_url TEXT,
  default_branch TEXT DEFAULT 'main',
  settings TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS projects_account_id_idx ON projects(account_id);

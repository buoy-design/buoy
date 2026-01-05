-- Developer Invites table
-- For designers to invite developers to connect their GitHub repo

CREATE TABLE IF NOT EXISTS developer_invites (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Invite token and message
  token TEXT NOT NULL UNIQUE,
  message TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, expired

  -- Acceptance details
  accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TEXT,
  repo_connected TEXT, -- "owner/repo" format

  -- Timestamps
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS developer_invites_account_id_idx ON developer_invites(account_id);
CREATE INDEX IF NOT EXISTS developer_invites_token_idx ON developer_invites(token);
CREATE INDEX IF NOT EXISTS developer_invites_status_idx ON developer_invites(status);

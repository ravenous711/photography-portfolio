-- Migration: access codes for client/group album access
-- Each row is one code; the plaintext is shown once and never stored.
-- Apply: wrangler d1 migrations apply portfolio-favorites --remote

CREATE TABLE IF NOT EXISTS access_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash   TEXT    NOT NULL UNIQUE,   -- SHA-256 of the plaintext code
  label       TEXT    NOT NULL,          -- human label e.g. "Smith Wedding Client"
  audience    TEXT    NOT NULL,          -- 'friends' | 'family' | 'client:<name>'
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  revoked     INTEGER NOT NULL DEFAULT 0 -- 0=active, 1=revoked
);

CREATE INDEX IF NOT EXISTS idx_access_codes_hash
  ON access_codes(code_hash) WHERE revoked = 0;

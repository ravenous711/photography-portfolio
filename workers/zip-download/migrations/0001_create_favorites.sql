-- Migration: create favorites table for anonymous photo heart-voting
-- Apply: wrangler d1 migrations apply portfolio-favorites --remote
-- Local:  wrangler d1 migrations apply portfolio-favorites --local

CREATE TABLE IF NOT EXISTS favorites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id    TEXT    NOT NULL,
  photo_url   TEXT    NOT NULL,
  session_id  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Enforce one heart per (session, photo)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_session_photo
  ON favorites(session_id, photo_url);

-- Fast tally by album
CREATE INDEX IF NOT EXISTS idx_tally
  ON favorites(album_id, photo_url);

-- Fast per-session lookup
CREATE INDEX IF NOT EXISTS idx_session_album
  ON favorites(session_id, album_id);

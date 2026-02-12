-- Postback queue table (same semantics as in-memory queue)
CREATE TABLE IF NOT EXISTS postback_queue (
  id TEXT PRIMARY KEY,
  postback_url TEXT NOT NULL,
  payload TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  headers TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  retries INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_postback_queue_status ON postback_queue(status);
CREATE INDEX IF NOT EXISTS idx_postback_queue_created_at ON postback_queue(created_at);

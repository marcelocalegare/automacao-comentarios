CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  comment_id TEXT,
  from_id TEXT,
  username TEXT,
  media_id TEXT,
  rule_index INTEGER,
  text_snippet TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

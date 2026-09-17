-- Schema for Multi-Agent Lead-Gen Pipeline (Postgres & SQLite Compatible)

CREATE TABLE IF NOT EXISTS leads_raw (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name TEXT,
  domain TEXT,
  place_id TEXT UNIQUE,
  city TEXT,
  niche TEXT,
  scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leads_verified (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_id INTEGER,
  email TEXT,
  domain TEXT,
  mx_valid INTEGER DEFAULT 0,
  verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(raw_id) REFERENCES leads_raw(id)
);

CREATE TABLE IF NOT EXISTS send_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER,
  draft_subject TEXT,
  draft_text TEXT,
  personalization_score INTEGER,
  niche TEXT,
  scheduled_at TIMESTAMP,
  status TEXT DEFAULT 'ready', -- 'ready', 'flagged', 'sent', 'failed'
  FOREIGN KEY(lead_id) REFERENCES leads_verified(id)
);

CREATE TABLE IF NOT EXISTS sent_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER,
  inbox_id TEXT,
  email TEXT,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  bounced INTEGER DEFAULT 0,
  replied INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inboxes (
  id TEXT PRIMARY KEY,
  email TEXT,
  from_name TEXT,
  niches TEXT,
  daily_cap INTEGER DEFAULT 100,
  sent_today INTEGER DEFAULT 0,
  health_status TEXT DEFAULT 'active', -- 'active', 'paused'
  last_sent_at TIMESTAMP,
  last_reset TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppression (
  email TEXT PRIMARY KEY,
  reason TEXT,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inbox_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inbox_id TEXT,
  bounce_rate REAL DEFAULT 0.0,
  complaint_rate REAL DEFAULT 0.0,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS region_stats (
  region TEXT PRIMARY KEY,
  total_leads INTEGER DEFAULT 0,
  invalid_leads INTEGER DEFAULT 0,
  priority_score REAL DEFAULT 1.0
);

-- Indexes for lightning fast queries across 1,000s of records
CREATE INDEX IF NOT EXISTS idx_leads_verified_email ON leads_verified(email);
CREATE INDEX IF NOT EXISTS idx_send_queue_status ON send_queue(status);
CREATE INDEX IF NOT EXISTS idx_sent_log_email ON sent_log(email);
CREATE INDEX IF NOT EXISTS idx_sent_log_inbox ON sent_log(inbox_id);

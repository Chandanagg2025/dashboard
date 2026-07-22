-- ============================================================
--  OCEMS Dashboard — Database Schema (v2 — with Auth + Complaints)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Sites ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sector      TEXT NOT NULL,
  city        TEXT NOT NULL,
  state       TEXT NOT NULL,
  spcb        TEXT NOT NULL,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  sig         TEXT NOT NULL DEFAULT 'green',
  last_data   TEXT NOT NULL DEFAULT 'Unknown',
  stacks      INTEGER NOT NULL DEFAULT 1,
  etp         INTEGER NOT NULL DEFAULT 0,
  cat         TEXT NOT NULL DEFAULT 'Stack',
  phone       TEXT NOT NULL DEFAULT ''
);

-- ── Parameters (per site) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS params (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id      TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  param_id     TEXT NOT NULL DEFAULT '',   -- Hardware sensor channel ID (e.g. OCEMS-001-PM10-CH1)
  key          TEXT NOT NULL,
  unit         TEXT NOT NULL DEFAULT '',
  value        REAL,
  limit_val    REAL NOT NULL,
  warn_val     REAL NOT NULL,
  min_val      REAL,
  sig          TEXT NOT NULL DEFAULT 'grey',
  history_json TEXT NOT NULL DEFAULT '[]',
  y_today      INTEGER NOT NULL DEFAULT 0,
  y30          INTEGER NOT NULL DEFAULT 0,
  conn_hrs     REAL NOT NULL DEFAULT 0,
  st_hrs       REAL NOT NULL DEFAULT 0
);

-- ── Alerts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id           TEXT PRIMARY KEY,
  site_id      TEXT NOT NULL,
  site_name    TEXT NOT NULL,
  param        TEXT NOT NULL,
  value        REAL NOT NULL,
  unit         TEXT NOT NULL DEFAULT '',
  limit_val    REAL NOT NULL,
  sig          TEXT NOT NULL,
  msg          TEXT NOT NULL,
  triggered_at INTEGER NOT NULL
);

-- ── Users ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('admin','industry','engineer')),
  site_id       TEXT,  -- only for industry users (their assigned site)
  phone         TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ── Complaints ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaints (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id       TEXT NOT NULL,
  raised_by     INTEGER NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  priority      TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','in_progress','resolved','closed')),
  assigned_to   INTEGER REFERENCES users(id),
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ── Complaint Updates (activity log) ──────────────────────
CREATE TABLE IF NOT EXISTS complaint_updates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id  INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  author_id     INTEGER NOT NULL REFERENCES users(id),
  message       TEXT NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ── Service Reports ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_reports (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id          INTEGER NOT NULL UNIQUE REFERENCES complaints(id),
  engineer_id           INTEGER NOT NULL REFERENCES users(id),
  visit_date            TEXT NOT NULL,
  arrival_time          TEXT NOT NULL DEFAULT '',
  departure_time        TEXT NOT NULL DEFAULT '',
  problem_found         TEXT NOT NULL,
  action_taken          TEXT NOT NULL,
  parts_replaced        TEXT NOT NULL DEFAULT '',
  recommendations       TEXT NOT NULL DEFAULT '',
  next_visit_date       TEXT NOT NULL DEFAULT '',
  client_name           TEXT NOT NULL DEFAULT '',
  client_designation    TEXT NOT NULL DEFAULT '',
  engineer_remarks      TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted')),
  created_at            INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at            INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_params_site     ON params(site_id);
CREATE INDEX IF NOT EXISTS idx_alerts_time     ON alerts(triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_site ON complaints(site_id);
CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(raised_by);
CREATE INDEX IF NOT EXISTS idx_complaints_eng  ON complaints(assigned_to);
CREATE INDEX IF NOT EXISTS idx_updates_comp    ON complaint_updates(complaint_id);

-- ── Analyzers (per site for contract billing) ──────────────
CREATE TABLE IF NOT EXISTS analyzers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id        TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  amc_amount     REAL NOT NULL DEFAULT 0,
  cmc_amount     REAL NOT NULL DEFAULT 0,
  balance_amount REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK(payment_status IN ('Paid','Partially Paid','Pending','Overdue')),
  contract_start TEXT NOT NULL DEFAULT '',
  contract_end   TEXT NOT NULL DEFAULT ''
);

-- ── Transactions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id        TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  analyzer_id    INTEGER REFERENCES analyzers(id) ON DELETE SET NULL,
  amount         REAL NOT NULL,
  payment_date   TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'Bank Transfer',
  reference_no   TEXT NOT NULL DEFAULT '',
  remarks        TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_analyzers_site ON analyzers(site_id);
CREATE INDEX IF NOT EXISTS idx_transactions_site ON transactions(site_id);
CREATE INDEX IF NOT EXISTS idx_transactions_analyzer ON transactions(analyzer_id);


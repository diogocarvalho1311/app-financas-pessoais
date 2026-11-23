-- Monetary amounts are integer cents; dates are local São Paulo calendar dates.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY CHECK(id IN ('PF','PJ')),
  opening_balance INTEGER NOT NULL,
  opening_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fixed_expenses (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  account TEXT NOT NULL REFERENCES accounts(id),
  category TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK(cadence IN ('30days','once','monthly')),
  next_date TEXT,
  last_paid TEXT,
  start_month TEXT,
  automatic INTEGER NOT NULL DEFAULT 0 CHECK(automatic IN (0,1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
  account TEXT NOT NULL REFERENCES accounts(id),
  category TEXT NOT NULL,
  date TEXT NOT NULL,
  fixed_id TEXT REFERENCES fixed_expenses(id),
  occurrence TEXT,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fixed_id, occurrence)
);
CREATE INDEX IF NOT EXISTS transactions_date ON transactions(date);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL);

-- New installations start empty; personal records live only in the private D1 database.
INSERT OR IGNORE INTO accounts VALUES ('PF',0,'2026-01-01'),('PJ',0,'2026-01-01');

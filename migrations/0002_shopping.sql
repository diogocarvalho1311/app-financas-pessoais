-- Purchase wishes are separate from the ledger and never debit an account.
-- Prices are positive integer cents, with the same limit as transaction amounts.
CREATE TABLE IF NOT EXISTS shopping_items (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 100),
  amount INTEGER NOT NULL CHECK(typeof(amount) = 'integer' AND amount > 0 AND amount <= 99999999999),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add explicit transaction date (separate from system created_at)
ALTER TABLE material_transactions
  ADD COLUMN IF NOT EXISTS transaction_date date NOT NULL DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_mat_tx_transaction_date
  ON material_transactions(transaction_date DESC);

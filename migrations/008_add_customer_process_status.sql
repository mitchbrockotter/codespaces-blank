ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS process_status TEXT NOT NULL DEFAULT 'ACTIEF'
    CHECK (process_status IN ('ACTIEF', 'AFGEROND', 'AFGESCHAALD')),
  ADD COLUMN IF NOT EXISTS status_assigned_at TIMESTAMPTZ;

UPDATE customers
SET process_status = 'ACTIEF'
WHERE process_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_tenant_status ON customers(tenant_id, process_status);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_status_assigned ON customers(tenant_id, status_assigned_at DESC);

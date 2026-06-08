ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

UPDATE users
SET is_active = true
WHERE is_active IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_tenant_active ON users(tenant_id, is_active);

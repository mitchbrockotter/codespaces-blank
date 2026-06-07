-- Add savings model settings per tenant

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS time_saved_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS login_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_used_bytes BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

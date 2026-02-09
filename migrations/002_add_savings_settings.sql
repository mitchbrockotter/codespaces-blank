-- Add savings model settings per tenant

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS time_saved_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(12, 2);

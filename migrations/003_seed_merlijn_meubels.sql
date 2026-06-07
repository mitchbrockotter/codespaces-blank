CREATE EXTENSION IF NOT EXISTS pgcrypto;

WITH tenant_row AS (
  INSERT INTO tenants (name)
  VALUES ('Merlijn Meubels')
  ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
), tenant_id AS (
  SELECT id FROM tenant_row
  UNION
  SELECT id FROM tenants WHERE name = 'Merlijn Meubels' LIMIT 1
)
INSERT INTO users (tenant_id, email, password_hash, role)
SELECT id, 'info@merlijn-meubels.nl', crypt('Welkom123', gen_salt('bf')), 'USER'
FROM tenant_id
ON CONFLICT (email) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role;

WITH tenant_id AS (
  SELECT id FROM tenants WHERE name = 'Merlijn Meubels' LIMIT 1
)
INSERT INTO tenant_settings (tenant_id, login_count, data_used_bytes, updated_at)
SELECT id, 0, 0, now()
FROM tenant_id
ON CONFLICT (tenant_id) DO UPDATE
SET updated_at = now();
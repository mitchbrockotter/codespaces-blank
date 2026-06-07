-- Seed startdata for Merlijn customer contacts module
-- This migration can be rerun safely; it only inserts rows that do not already exist.

WITH tenant_id AS (
  SELECT id
  FROM tenants
  WHERE name = 'Merlijn Meubels'
  LIMIT 1
), base_customers AS (
  SELECT * FROM (
    VALUES
      ('Van Dijk Interieur', 'Van Dijk Interieur B.V.', 'inkoop@vandijkinterieur.nl', '0611111111'),
      ('Brouwer Projectinrichting', 'Brouwer Projectinrichting', 'info@brouwerproject.nl', '0622222222'),
      ('De Klerk Vastgoed', 'De Klerk Vastgoed', 'contact@deklerkvastgoed.nl', '0633333333'),
      ('Studio Noorderlicht', 'Studio Noorderlicht', 'hello@studionoorderlicht.nl', '0644444444'),
      ('Woonatelier Zuid', 'Woonatelier Zuid', 'team@woonatelierzuid.nl', '0655555555')
  ) AS t(name, company, email, phone)
), inserted_customers AS (
  INSERT INTO customers (tenant_id, name, company, email, phone, created_at, updated_at)
  SELECT tenant_id.id, c.name, c.company, c.email, c.phone, now(), now()
  FROM tenant_id
  CROSS JOIN base_customers c
  WHERE NOT EXISTS (
    SELECT 1
    FROM customers existing
    WHERE existing.tenant_id = tenant_id.id
      AND lower(existing.name) = lower(c.name)
      AND COALESCE(lower(existing.company), '') = COALESCE(lower(c.company), '')
  )
  RETURNING id, tenant_id, name
), all_customers AS (
  SELECT id, tenant_id, name
  FROM inserted_customers
  UNION
  SELECT c.id, c.tenant_id, c.name
  FROM customers c
  JOIN tenant_id ON tenant_id.id = c.tenant_id
  WHERE c.name IN (
    'Van Dijk Interieur',
    'Brouwer Projectinrichting',
    'De Klerk Vastgoed',
    'Studio Noorderlicht',
    'Woonatelier Zuid'
  )
), user_id AS (
  SELECT id
  FROM users
  WHERE lower(email) = 'info@merlijn-meubels.nl'
  LIMIT 1
), events AS (
  SELECT * FROM (
    VALUES
      ('Van Dijk Interieur', now() - interval '2 days', 'Telefoon', 'Offerte nabellen voor levering in week 26.'),
      ('Brouwer Projectinrichting', now() - interval '11 days', 'Email', 'Wacht op akkoord op aangepaste prijsopgave.'),
      ('De Klerk Vastgoed', now() - interval '19 days', 'WhatsApp', 'Herinnering gestuurd voor keuze definitieve stof.'),
      ('Studio Noorderlicht', now() - interval '5 days', 'Op locatie', 'Showroombezoek gepland voor volgende week.'),
      ('Woonatelier Zuid', now() - interval '15 days', 'Telefoon', 'Nieuwe aanvraag voor maatwerk ontvangen.')
  ) AS e(customer_name, contacted_at, contact_method, summary)
)
INSERT INTO customer_contact_events (tenant_id, customer_id, contacted_at, contact_method, summary, created_by)
SELECT c.tenant_id, c.id, e.contacted_at, e.contact_method, e.summary, user_id.id
FROM all_customers c
JOIN events e ON e.customer_name = c.name
LEFT JOIN user_id ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM customer_contact_events existing
  WHERE existing.tenant_id = c.tenant_id
    AND existing.customer_id = c.id
    AND existing.contact_method = e.contact_method
    AND existing.summary = e.summary
);

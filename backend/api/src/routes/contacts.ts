import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware";

const router = Router();

const createCustomerSchema = z.object({
  name: z.string().min(2).max(120),
  company: z.string().max(160).optional(),
  email: z.string().email().max(160).optional(),
  phone: z.string().max(60).optional()
});

const updateCustomerSchema = z.object({
  name: z.string().min(2).max(120),
  company: z.string().max(160).optional(),
  email: z.string().email().max(160).optional(),
  phone: z.string().max(60).optional()
});

const createEventSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  contactedAt: z.string().datetime().optional(),
  contactMethod: z.string().min(2).max(40),
  summary: z.string().max(1000).optional()
});

const importRowSchema = z.object({
  name: z.string().min(2).max(120),
  company: z.string().max(160).optional(),
  email: z.string().email().max(160).optional(),
  phone: z.string().max(60).optional(),
  contactedAt: z.string().datetime().optional(),
  contactMethod: z.string().min(2).max(40).optional(),
  summary: z.string().max(1000).optional()
});

const importSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(2000)
});

async function isMerlijnTenant(tenantId: number) {
  const result = await pool.query(
    "SELECT name FROM tenants WHERE id = $1",
    [tenantId]
  );
  const tenantName = String(result.rows[0]?.name ?? "").toLowerCase();
  return tenantName.includes("merlijn") && tenantName.includes("meubel");
}

router.use(requireAuth);

router.get("/access", async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const enabled = await isMerlijnTenant(tenantId);
    return res.json({ enabled });
  } catch (error) {
    return next(error);
  }
});

router.use(async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const enabled = await isMerlijnTenant(tenantId);
    if (!enabled) {
      return res.status(403).json({ error: "This module is only available in the Merlijn environment" });
    }

    return next();
  } catch (error) {
    return next(error);
  }
});

router.post("/customers", async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = createCustomerSchema.parse(req.body);

    const result = await pool.query(
      "INSERT INTO customers (tenant_id, name, company, email, phone, updated_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING id, name, company, email, phone, created_at",
      [tenantId, payload.name, payload.company ?? null, payload.email ?? null, payload.phone ?? null]
    );

    return res.status(201).json({ customer: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.get("/customers", async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const followUpDaysRaw = Number(req.query.followUpDays ?? 14);
    const followUpDays = Number.isFinite(followUpDaysRaw) ? Math.max(1, Math.min(120, followUpDaysRaw)) : 14;

    const result = await pool.query(
      "SELECT c.id, c.name, c.company, c.email, c.phone, c.created_at, e.contacted_at AS last_contact_at, e.contact_method AS last_contact_method, e.summary AS last_contact_summary, COALESCE(FLOOR(EXTRACT(EPOCH FROM (now() - e.contacted_at)) / 86400)::int, NULL) AS days_since_last_contact FROM customers c LEFT JOIN LATERAL ( SELECT contacted_at, contact_method, summary FROM customer_contact_events WHERE tenant_id = $1 AND customer_id = c.id ORDER BY contacted_at DESC LIMIT 1 ) e ON true WHERE c.tenant_id = $1 ORDER BY COALESCE(e.contacted_at, c.created_at) DESC, c.name ASC",
      [tenantId]
    );

    const customers = result.rows.map((row) => {
      const daysSinceLastContact =
        row.days_since_last_contact === null || row.days_since_last_contact === undefined
          ? null
          : Number(row.days_since_last_contact);
      const needsFollowUp =
        daysSinceLastContact === null ? true : daysSinceLastContact >= followUpDays;

      return {
        id: Number(row.id),
        name: row.name,
        company: row.company,
        email: row.email,
        phone: row.phone,
        createdAt: row.created_at,
        lastContactAt: row.last_contact_at,
        lastContactMethod: row.last_contact_method,
        lastContactSummary: row.last_contact_summary,
        daysSinceLastContact,
        needsFollowUp
      };
    });

    const followUpNeeded = customers.filter((customer) => customer.needsFollowUp).length;

    return res.json({
      followUpDays,
      totalCustomers: customers.length,
      followUpNeeded,
      customers
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/customers/:customerId", async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const customerId = z.coerce.number().int().positive().parse(req.params.customerId);
    const payload = updateCustomerSchema.parse(req.body);

    const normalizedEmail = payload.email?.trim().toLowerCase() || null;
    if (normalizedEmail) {
      const emailResult = await pool.query(
        "SELECT id FROM customers WHERE tenant_id = $1 AND lower(email) = $2 AND id <> $3 LIMIT 1",
        [tenantId, normalizedEmail, customerId]
      );
      if ((emailResult.rowCount ?? 0) > 0) {
        return res.status(409).json({ error: "Email already used by another customer" });
      }
    }

    const result = await pool.query(
      "UPDATE customers SET name = $1, company = $2, email = $3, phone = $4, updated_at = now() WHERE id = $5 AND tenant_id = $6 RETURNING id, name, company, email, phone, created_at, updated_at",
      [
        payload.name.trim(),
        payload.company?.trim() || null,
        normalizedEmail,
        payload.phone?.trim() || null,
        customerId,
        tenantId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    return res.json({ customer: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.delete("/customers/:customerId", async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const customerId = z.coerce.number().int().positive().parse(req.params.customerId);

    const result = await pool.query(
      "DELETE FROM customers WHERE id = $1 AND tenant_id = $2 RETURNING id",
      [customerId, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post("/events", async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId;
    const userId = req.auth?.id;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = createEventSchema.parse(req.body);

    const customerResult = await pool.query(
      "SELECT id FROM customers WHERE id = $1 AND tenant_id = $2",
      [payload.customerId, tenantId]
    );
    if (customerResult.rowCount === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const contactedAt = payload.contactedAt ? new Date(payload.contactedAt) : new Date();

    await pool.query(
      "INSERT INTO customer_contact_events (tenant_id, customer_id, contacted_at, contact_method, summary, created_by) VALUES ($1, $2, $3, $4, $5, $6)",
      [tenantId, payload.customerId, contactedAt, payload.contactMethod, payload.summary ?? null, userId]
    );

    await pool.query(
      "UPDATE customers SET updated_at = now() WHERE id = $1 AND tenant_id = $2",
      [payload.customerId, tenantId]
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post("/import", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const tenantId = req.auth?.tenantId;
    const userId = req.auth?.id;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { rows } = importSchema.parse(req.body);

    await client.query("BEGIN");

    let createdCustomers = 0;
    let updatedCustomers = 0;
    let createdEvents = 0;

    for (const row of rows) {
      const normalizedName = row.name.trim();
      const normalizedCompany = row.company?.trim() || null;
      const normalizedEmail = row.email?.trim().toLowerCase() || null;
      const normalizedPhone = row.phone?.trim() || null;

      const existingCustomerResult = normalizedEmail
        ? await client.query(
            "SELECT id FROM customers WHERE tenant_id = $1 AND lower(email) = $2 LIMIT 1",
            [tenantId, normalizedEmail]
          )
        : await client.query(
            "SELECT id FROM customers WHERE tenant_id = $1 AND lower(name) = lower($2) AND COALESCE(lower(company), '') = COALESCE(lower($3), '') LIMIT 1",
            [tenantId, normalizedName, normalizedCompany]
          );

      let customerId: number;

      if ((existingCustomerResult.rowCount ?? 0) > 0) {
        customerId = Number(existingCustomerResult.rows[0].id);
        await client.query(
          "UPDATE customers SET name = $1, company = COALESCE($2, company), email = COALESCE($3, email), phone = COALESCE($4, phone), updated_at = now() WHERE id = $5 AND tenant_id = $6",
          [normalizedName, normalizedCompany, normalizedEmail, normalizedPhone, customerId, tenantId]
        );
        updatedCustomers += 1;
      } else {
        const insertCustomerResult = await client.query(
          "INSERT INTO customers (tenant_id, name, company, email, phone, updated_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING id",
          [tenantId, normalizedName, normalizedCompany, normalizedEmail, normalizedPhone]
        );
        customerId = Number(insertCustomerResult.rows[0].id);
        createdCustomers += 1;
      }

      if (row.contactedAt || row.contactMethod || row.summary) {
        await client.query(
          "INSERT INTO customer_contact_events (tenant_id, customer_id, contacted_at, contact_method, summary, created_by) VALUES ($1, $2, $3, $4, $5, $6)",
          [
            tenantId,
            customerId,
            row.contactedAt ? new Date(row.contactedAt) : new Date(),
            row.contactMethod?.trim() || "Onbekend",
            row.summary?.trim() || null,
            userId
          ]
        );
        createdEvents += 1;
      }
    }

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      importedRows: rows.length,
      createdCustomers,
      updatedCustomers,
      createdEvents
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
});

export default router;

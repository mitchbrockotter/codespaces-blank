import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import multer from "multer";
import { pool } from "../db";
import { requireAuth, requireRole } from "../middleware";
import { putObject } from "../s3";
import { guessMimeType, safeFilename, sha256 } from "../utils";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth, requireRole("ADMIN"));

function auditLog(event: string, meta: Record<string, unknown>) {
  console.log(JSON.stringify({
    level: "info",
    msg: "admin_audit",
    event,
    ...meta
  }));
}

const tenantSchema = z.object({
  name: z.string().min(2)
});

router.post("/tenants", async (req, res, next) => {
  try {
    const { name } = tenantSchema.parse(req.body);
    const result = await pool.query(
      "INSERT INTO tenants (name) VALUES ($1) RETURNING *",
      [name]
    );
    auditLog("tenant_created", { tenantId: result.rows[0].id, name, actorId: req.auth?.id });
    return res.json({ tenant: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.get("/tenants", async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM tenants ORDER BY created_at DESC");
    return res.json({ tenants: result.rows });
  } catch (error) {
    return next(error);
  }
});

const userSchema = z.object({
  tenantId: z.coerce.number().int(),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "USER"]).optional()
});

router.post("/users", async (req, res, next) => {
  try {
    const { tenantId, email, password, role } = userSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, tenant_id, email, role, created_at",
      [tenantId, email, passwordHash, role ?? "USER"]
    );
    auditLog("user_created", { userId: result.rows[0].id, tenantId, actorId: req.auth?.id });
    return res.json({ user: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

const jarSchema = z.object({
  tenantId: z.coerce.number().int(),
  name: z.string().min(1),
  version: z.string().min(1)
});

router.post("/jars", upload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Jar file is required" });
    }
    const { tenantId, name, version } = jarSchema.parse(req.body);
    const filename = safeFilename(file.originalname);
    const storageKey = `tenants/${tenantId}/jars/${Date.now()}-${filename}`;
    const hash = sha256(file.buffer);

    await putObject({
      key: storageKey,
      body: file.buffer,
      contentType: guessMimeType(filename)
    });

    const result = await pool.query(
      "INSERT INTO jars (tenant_id, name, version, storage_key, sha256, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [tenantId, name, version, storageKey, hash, req.auth?.id ?? null]
    );
    auditLog("jar_uploaded", { jarId: result.rows[0].id, tenantId, actorId: req.auth?.id });

    return res.json({ jar: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.get("/jars", async (req, res, next) => {
  try {
    const tenantId = req.query.tenantId ? Number(req.query.tenantId) : null;
    const result = tenantId
      ? await pool.query("SELECT * FROM jars WHERE tenant_id = $1 ORDER BY created_at DESC", [tenantId])
      : await pool.query("SELECT * FROM jars ORDER BY created_at DESC");
    return res.json({ jars: result.rows });
  } catch (error) {
    return next(error);
  }
});

const activeJarSchema = z.object({
  jarId: z.coerce.number().int()
});

const savingsSchema = z.object({
  timeSavedMinutes: z.coerce.number().int().min(0),
  hourlyRate: z.coerce.number().min(0)
});

router.post("/tenants/:tenantId/active-jar", async (req, res, next) => {
  try {
    const tenantId = Number(req.params.tenantId);
    const { jarId } = activeJarSchema.parse(req.body);
    await pool.query(
      "INSERT INTO tenant_settings (tenant_id, active_jar_id, updated_at) VALUES ($1, $2, now()) ON CONFLICT (tenant_id) DO UPDATE SET active_jar_id = $2, updated_at = now()",
      [tenantId, jarId]
    );
    auditLog("active_jar_set", { tenantId, jarId, actorId: req.auth?.id });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post("/tenants/:tenantId/savings", async (req, res, next) => {
  try {
    const tenantId = Number(req.params.tenantId);
    const { timeSavedMinutes, hourlyRate } = savingsSchema.parse(req.body);
    await pool.query(
      "INSERT INTO tenant_settings (tenant_id, time_saved_minutes, hourly_rate, updated_at) VALUES ($1, $2, $3, now()) ON CONFLICT (tenant_id) DO UPDATE SET time_saved_minutes = $2, hourly_rate = $3, updated_at = now()",
      [tenantId, timeSavedMinutes, hourlyRate]
    );
    auditLog("savings_updated", { tenantId, timeSavedMinutes, hourlyRate, actorId: req.auth?.id });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get("/jobs", async (req, res, next) => {
  try {
    const tenantId = req.query.tenantId ? Number(req.query.tenantId) : null;
    if (!tenantId) {
      return res.status(400).json({ error: "tenantId is required" });
    }
    const result = await pool.query(
      "SELECT j.*, r.filename, r.mime_type, r.size_bytes FROM jobs j LEFT JOIN reports r ON r.job_id = j.id WHERE j.tenant_id = $1 ORDER BY j.created_at DESC LIMIT 20",
      [tenantId]
    );
    return res.json({ jobs: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/tenants/:tenantId/summary", async (req, res, next) => {
  try {
    const tenantId = Number(req.params.tenantId);
    const settingsResult = await pool.query(
      "SELECT ts.time_saved_minutes, ts.hourly_rate, j.name AS jar_name FROM tenant_settings ts LEFT JOIN jars j ON j.id = ts.active_jar_id WHERE ts.tenant_id = $1",
      [tenantId]
    );
    const settings = settingsResult.rows[0] ?? null;

    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS total_runs FROM jobs WHERE tenant_id = $1 AND status = 'done'",
      [tenantId]
    );
    const totalRuns = countResult.rows[0]?.total_runs ?? 0;

    const timeSavedMinutes = settings?.time_saved_minutes ?? null;
    const hourlyRate = settings?.hourly_rate ? Number(settings.hourly_rate) : null;
    const moneySaved =
      timeSavedMinutes !== null && hourlyRate !== null
        ? Number(((totalRuns * timeSavedMinutes) / 60) * hourlyRate)
        : null;

    return res.json({
      toolName: settings?.jar_name ?? null,
      totalRuns,
      timeSavedMinutes,
      hourlyRate,
      moneySaved
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/tenants/:tenantId/usage", async (req, res, next) => {
  try {
    const tenantId = Number(req.params.tenantId);
    const result = await pool.query(
      "WITH days AS (\n" +
        "  SELECT generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') AS day\n" +
        ")\n" +
        "SELECT to_char(days.day, 'YYYY-MM-DD') AS day, COALESCE(COUNT(j.id), 0)::int AS runs\n" +
        "FROM days\n" +
        "LEFT JOIN jobs j ON j.tenant_id = $1 AND j.status = 'done' AND date_trunc('day', j.finished_at) = days.day\n" +
        "GROUP BY days.day\n" +
        "ORDER BY days.day",
      [tenantId]
    );

    return res.json({ points: result.rows });
  } catch (error) {
    return next(error);
  }
});

export default router;

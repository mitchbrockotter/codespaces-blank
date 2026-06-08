import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import multer from "multer";
import { pool, withTransaction } from "../db";
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

const environmentSchema = z.object({
  environmentName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "USER"]).optional().default("USER")
});

function formatBytes(bytes: number) {
  if (!bytes) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

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

router.post("/environments", async (req, res, next) => {
  try {
    const { environmentName, email, password, role } = environmentSchema.parse(req.body);

    const result = await withTransaction(async (client) => {
      const tenantResult = await client.query(
        "INSERT INTO tenants (name) VALUES ($1) RETURNING *",
        [environmentName]
      );

      const passwordHash = await bcrypt.hash(password, 10);
      const userResult = await client.query(
        "INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, tenant_id, email, role, created_at",
        [tenantResult.rows[0].id, email, passwordHash, role]
      );

      await client.query(
        "INSERT INTO tenant_settings (tenant_id, updated_at) VALUES ($1, now()) ON CONFLICT (tenant_id) DO NOTHING",
        [tenantResult.rows[0].id]
      );

      return { tenant: tenantResult.rows[0], user: userResult.rows[0] };
    });

    auditLog("environment_created", {
      tenantId: result.tenant.id,
      userId: result.user.id,
      environmentName,
      actorId: req.auth?.id
    });

    return res.status(201).json(result);
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

router.get("/overview", async (_req, res, next) => {
  try {
    const planPriceEur = 5;

    const result = await pool.query(
      "SELECT t.id, t.name, t.created_at, " +
        "COALESCE(ts.data_used_bytes, 0)::bigint AS data_used_bytes, " +
        "COALESCE(ts.login_count, 0)::int AS login_count, " +
        "ts.last_login_at, " +
        "COALESCE(run_stats.total_runs, 0)::int AS total_runs " +
        "FROM tenants t " +
        "LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id " +
        "LEFT JOIN ( " +
        "  SELECT tenant_id, COUNT(*)::int AS total_runs " +
        "  FROM jobs " +
        "  WHERE status = 'done' " +
        "  GROUP BY tenant_id " +
        ") run_stats ON run_stats.tenant_id = t.id " +
        "ORDER BY t.created_at DESC"
    );

    const tenants = result.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      createdAt: row.created_at,
      totalRuns: Number(row.total_runs ?? 0),
      loginCount: Number(row.login_count ?? 0),
      dataUsedBytes: Number(row.data_used_bytes ?? 0),
      dataUsedLabel: formatBytes(Number(row.data_used_bytes ?? 0)),
      lastLoginAt: row.last_login_at ?? null
    }));

    const totalDataUsedBytes = tenants.reduce((sum, tenant) => sum + tenant.dataUsedBytes, 0);

    const tenantsWithCost = tenants.map((tenant) => {
      const dataShare = totalDataUsedBytes > 0 ? tenant.dataUsedBytes / totalDataUsedBytes : 0;
      const estimatedPlanCostEur = Number((planPriceEur * dataShare).toFixed(2));
      return {
        ...tenant,
        estimatedPlanCostEur
      };
    });

    return res.json({
      planPriceEur,
      totalEnvironments: tenantsWithCost.length,
      totalDataUsedBytes,
      totalDataUsedLabel: formatBytes(totalDataUsedBytes),
      totalEstimatedCostEur: planPriceEur,
      tenants: tenantsWithCost
    });
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

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(["ADMIN", "USER"]).optional()
}).refine((value) => Boolean(value.email || value.role), {
  message: "Provide email and/or role"
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8)
});

const userStatusSchema = z.object({
  isActive: z.boolean()
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

router.get("/tenants/:tenantId/users", async (req, res, next) => {
  try {
    const tenantId = Number(req.params.tenantId);
    const includeInactive = String(req.query.includeInactive ?? "false").toLowerCase() === "true";

    const result = includeInactive
      ? await pool.query(
          "SELECT id, tenant_id, email, role, COALESCE(is_active, true) AS is_active, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at DESC",
          [tenantId]
        )
      : await pool.query(
          "SELECT id, tenant_id, email, role, COALESCE(is_active, true) AS is_active, created_at FROM users WHERE tenant_id = $1 AND COALESCE(is_active, true) = true ORDER BY created_at DESC",
          [tenantId]
        );

    const users = result.rows.map((row) => ({
      id: Number(row.id),
      tenantId: Number(row.tenant_id),
      email: row.email,
      role: row.role,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at
    }));

    return res.json({ users });
  } catch (error) {
    return next(error);
  }
});

router.patch("/users/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const payload = updateUserSchema.parse(req.body);

    const existingResult = await pool.query(
      "SELECT id, email, role, COALESCE(is_active, true) AS is_active FROM users WHERE id = $1",
      [userId]
    );
    const existingUser = existingResult.rows[0];
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const nextEmail = payload.email?.trim().toLowerCase() ?? existingUser.email;
    const nextRole = payload.role ?? existingUser.role;

    if (req.auth?.id === userId && nextRole !== "ADMIN") {
      return res.status(400).json({ error: "Cannot remove your own admin role" });
    }

    const result = await pool.query(
      "UPDATE users SET email = $1, role = $2 WHERE id = $3 RETURNING id, tenant_id, email, role, COALESCE(is_active, true) AS is_active, created_at",
      [nextEmail, nextRole, userId]
    );

    auditLog("user_updated", { userId, actorId: req.auth?.id, nextRole, nextEmail });

    return res.json({
      user: {
        id: Number(result.rows[0].id),
        tenantId: Number(result.rows[0].tenant_id),
        email: result.rows[0].email,
        role: result.rows[0].role,
        isActive: Boolean(result.rows[0].is_active),
        createdAt: result.rows[0].created_at
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/users/:userId/reset-password", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { newPassword } = resetPasswordSchema.parse(req.body);

    const userResult = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [passwordHash, userId]
    );

    auditLog("user_password_reset", { userId, actorId: req.auth?.id });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.post("/users/:userId/status", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const { isActive } = userStatusSchema.parse(req.body);

    if (req.auth?.id === userId && !isActive) {
      return res.status(400).json({ error: "Cannot deactivate your own account" });
    }

    const result = await pool.query(
      "UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, tenant_id, email, role, COALESCE(is_active, true) AS is_active, created_at",
      [isActive, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    auditLog("user_status_updated", { userId, isActive, actorId: req.auth?.id });
    return res.json({
      user: {
        id: Number(result.rows[0].id),
        tenantId: Number(result.rows[0].tenant_id),
        email: result.rows[0].email,
        role: result.rows[0].role,
        isActive: Boolean(result.rows[0].is_active),
        createdAt: result.rows[0].created_at
      }
    });
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

    await pool.query(
      "INSERT INTO tenant_settings (tenant_id, data_used_bytes, updated_at) VALUES ($1, $2, now()) ON CONFLICT (tenant_id) DO UPDATE SET data_used_bytes = tenant_settings.data_used_bytes + $2, updated_at = now()",
      [tenantId, file.size]
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
    const jarResult = await pool.query("SELECT tenant_id FROM jars WHERE id = $1", [jarId]);
    const jar = jarResult.rows[0];
    if (!jar) {
      return res.status(404).json({ error: "Jar not found" });
    }
    if (jar.tenant_id !== tenantId) {
      return res.status(400).json({ error: "Jar does not belong to tenant" });
    }
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
      "SELECT ts.time_saved_minutes, ts.hourly_rate, ts.login_count, ts.data_used_bytes, ts.last_login_at, j.name AS jar_name FROM tenant_settings ts LEFT JOIN jars j ON j.id = ts.active_jar_id WHERE ts.tenant_id = $1",
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

    const dataUsedBytes = Number(settings?.data_used_bytes ?? 0);

    return res.json({
      toolName: settings?.jar_name ?? null,
      totalRuns,
      timeSavedMinutes,
      hourlyRate,
      moneySaved,
      loginCount: settings?.login_count ?? 0,
      dataUsedBytes,
      dataUsedLabel: formatBytes(dataUsedBytes),
      lastLoginAt: settings?.last_login_at ?? null
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

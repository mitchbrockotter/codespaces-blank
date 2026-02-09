import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { env } from "../env";
import { requireAuth } from "../middleware";
import { checkRateLimit } from "../rateLimit";
import { createDownloadUrl } from "../s3";
import { generateToken, sha256 } from "../utils";

const router = Router();

router.use(requireAuth);

router.post("/run", async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    checkRateLimit(`tenant:${tenantId}`, env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_SECONDS);

    const settings = await pool.query(
      "SELECT active_jar_id FROM tenant_settings WHERE tenant_id = $1",
      [tenantId]
    );
    const activeJarId = settings.rows[0]?.active_jar_id;
    if (!activeJarId) {
      return res.status(400).json({ error: "No active jar configured" });
    }

    const result = await pool.query(
      "INSERT INTO jobs (tenant_id, jar_id, status) VALUES ($1, $2, 'queued') RETURNING id",
      [tenantId, activeJarId]
    );

    return res.json({ jobId: result.rows[0].id });
  } catch (error) {
    return next(error);
  }
});

router.get("/jobs/:jobId", async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId;
    const jobId = z.coerce.number().int().parse(req.params.jobId);
    const jobResult = await pool.query(
      "SELECT * FROM jobs WHERE id = $1 AND tenant_id = $2",
      [jobId, tenantId]
    );
    const job = jobResult.rows[0];
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    let report = null;
    if (job.status === "done") {
      const reportResult = await pool.query(
        "SELECT id, filename, mime_type, size_bytes, created_at FROM reports WHERE job_id = $1 AND tenant_id = $2",
        [jobId, tenantId]
      );
      report = reportResult.rows[0] ?? null;
    }

    return res.json({ job, report });
  } catch (error) {
    return next(error);
  }
});

router.post("/jobs/:jobId/download-token", async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId;
    const jobId = z.coerce.number().int().parse(req.params.jobId);
    const reportResult = await pool.query(
      "SELECT r.id FROM reports r JOIN jobs j ON j.id = r.job_id WHERE j.id = $1 AND j.tenant_id = $2 AND j.status = 'done'",
      [jobId, tenantId]
    );
    const report = reportResult.rows[0];
    if (!report) {
      return res.status(400).json({ error: "Report not ready" });
    }

    const token = generateToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + env.DOWNLOAD_TOKEN_TTL_MINUTES * 60 * 1000);

    await pool.query(
      "INSERT INTO download_tokens (tenant_id, report_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
      [tenantId, report.id, tokenHash, expiresAt]
    );

    return res.json({ token, expiresAt });
  } catch (error) {
    return next(error);
  }
});

router.get("/download/:token", async (req, res, next) => {
  try {
    const tenantId = req.auth?.tenantId;
    const rawToken = req.params.token;
    const tokenHash = sha256(rawToken);

    const tokenResult = await pool.query(
      "SELECT dt.id, dt.tenant_id, dt.expires_at, dt.used_at, r.storage_key, r.filename, r.mime_type FROM download_tokens dt JOIN reports r ON r.id = dt.report_id WHERE dt.token_hash = $1",
      [tokenHash]
    );
    const record = tokenResult.rows[0];
    if (!record || record.tenant_id !== tenantId) {
      return res.status(404).json({ error: "Token not found" });
    }

    const update = await pool.query(
      "UPDATE download_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL AND expires_at > now() RETURNING id",
      [record.id]
    );
    if (update.rowCount === 0) {
      return res.status(400).json({ error: "Token expired or already used" });
    }

    const url = await createDownloadUrl({
      key: record.storage_key,
      filename: record.filename,
      contentType: record.mime_type,
      expiresIn: 60
    });

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", url);
    return res.status(302).end();
  } catch (error) {
    return next(error);
  }
});

export default router;

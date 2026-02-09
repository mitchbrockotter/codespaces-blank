import fs from "fs";
import path from "path";
import os from "os";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";
import { pool } from "./db";
import { env } from "./env";
import { downloadObject, uploadObject } from "./s3";
import { guessMimeType, sha256File } from "./utils";

type JobRow = {
  id: number;
  tenant_id: number;
  jar_id: number;
  status: string;
};

type JarRow = {
  id: number;
  storage_key: string;
  sha256: string;
};

async function claimJob(): Promise<{ job: JobRow; jar: JarRow } | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const jobResult = await client.query<JobRow>(
      "UPDATE jobs SET status = 'running', started_at = now() WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *"
    );
    if (jobResult.rows.length === 0) {
      await client.query("COMMIT");
      return null;
    }
    const job = jobResult.rows[0];
    const jarResult = await client.query<JarRow>("SELECT id, storage_key, sha256 FROM jars WHERE id = $1", [job.jar_id]);
    const jar = jarResult.rows[0];
    if (!jar) {
      await client.query(
        "UPDATE jobs SET status = 'failed', error_message = 'Jar not found', finished_at = now() WHERE id = $1",
        [job.id]
      );
      await client.query("COMMIT");
      return null;
    }
    await client.query("COMMIT");
    return { job, jar };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function runJob(job: JobRow, jar: JarRow) {
  console.log(JSON.stringify({ level: "info", msg: "job_start", jobId: job.id, tenantId: job.tenant_id, jarId: jar.id }));
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `job-${job.id}-`));
  const jarPath = path.join(tempDir, "runner.jar");

  try {
    const jarObject = await downloadObject(jar.storage_key);
    const body = jarObject.Body as NodeJS.ReadableStream | undefined;
    if (!body || typeof (body as NodeJS.ReadableStream).pipe !== "function") {
      throw new Error("Invalid jar stream");
    }
    await pipeline(body, fs.createWriteStream(jarPath));

    const jarBuffer = await fs.promises.readFile(jarPath);
    const jarHash = sha256File(jarBuffer);
    if (jarHash !== jar.sha256) {
      throw new Error("Jar checksum mismatch");
    }

    await runJarProcess(jarPath, tempDir, env.JOB_TIMEOUT_SECONDS * 1000);

    const outputFile = await findOutputFile(tempDir, jarPath);
    if (!outputFile) {
      throw new Error("No output file produced by jar");
    }

    const fileStats = await fs.promises.stat(outputFile);
    const filename = path.basename(outputFile);
    const storageKey = `tenants/${job.tenant_id}/reports/${job.id}/${filename}`;
    const contentType = guessMimeType(filename);

    await uploadObject({
      key: storageKey,
      body: fs.createReadStream(outputFile),
      contentType
    });

    await pool.query(
      "INSERT INTO reports (tenant_id, job_id, storage_key, filename, mime_type, size_bytes) VALUES ($1, $2, $3, $4, $5, $6)",
      [job.tenant_id, job.id, storageKey, filename, contentType, fileStats.size]
    );

    await pool.query(
      "UPDATE jobs SET status = 'done', progress = 100, finished_at = now() WHERE id = $1",
      [job.id]
    );
    console.log(JSON.stringify({ level: "info", msg: "job_done", jobId: job.id }));
  } catch (error) {
    await pool.query(
      "UPDATE jobs SET status = 'failed', error_message = $1, finished_at = now() WHERE id = $2",
      [String((error as Error).message || error), job.id]
    );
    console.log(JSON.stringify({ level: "error", msg: "job_failed", jobId: job.id, error: String((error as Error).message || error) }));
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

async function runJarProcess(jarPath: string, cwd: string, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("java", ["-jar", jarPath], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Jar execution timed out"));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Jar exited with code ${code}`));
      }
    });
  });
}

async function findOutputFile(tempDir: string, jarPath: string) {
  const entries = await fs.promises.readdir(tempDir, { withFileTypes: true });
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const fullPath = path.join(tempDir, entry.name);
        if (fullPath === jarPath) {
          return null;
        }
        const stat = await fs.promises.stat(fullPath);
        return { path: fullPath, mtime: stat.mtimeMs };
      })
  );

  const filtered = candidates.filter((item): item is { path: string; mtime: number } => Boolean(item));
  if (filtered.length === 0) {
    return null;
  }
  filtered.sort((a, b) => b.mtime - a.mtime);
  return filtered[0].path;
}

async function workerLoop() {
  while (true) {
    const claimed = await claimJob();
    if (claimed) {
      await runJob(claimed.job, claimed.jar);
    } else {
      await new Promise((resolve) => setTimeout(resolve, env.WORKER_POLL_INTERVAL_MS));
    }
  }
}

workerLoop().catch((error) => {
  console.error("Worker crashed", error);
  process.exit(1);
});

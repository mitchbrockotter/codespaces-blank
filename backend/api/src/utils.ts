import crypto from "crypto";
import path from "path";

const mimeMap: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jar": "application/java-archive",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".zip": "application/zip",
  ".txt": "text/plain"
};

export function sha256(input: Buffer | string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function safeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return mimeMap[ext] || "application/octet-stream";
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

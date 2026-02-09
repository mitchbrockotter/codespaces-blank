import crypto from "crypto";
import path from "path";

const mimeMap: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".zip": "application/zip",
  ".txt": "text/plain"
};

export function sha256File(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function guessMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return mimeMap[ext] || "application/octet-stream";
}

import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FRONTEND_ORIGIN: z.string().url(),
  JWT_SECRET: z.string().min(10),
  COOKIE_NAME: z.string().default("pkba_session"),
  DATABASE_URL: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  DOWNLOAD_TOKEN_TTL_MINUTES: z.coerce.number().default(5),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(10),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(300),
  RATE_LIMIT_MAX: z.coerce.number().default(3),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(600)
});

export const env = envSchema.parse(process.env);

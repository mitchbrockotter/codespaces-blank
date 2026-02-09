import express from "express";
import crypto from "crypto";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./env";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import reportRoutes from "./routes/reports";
import { enforceOrigin } from "./middleware";

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use((req, res, next) => {
  const requestId = crypto.randomBytes(12).toString("hex");
  res.setHeader("X-Request-Id", requestId);
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    console.log(JSON.stringify({
      level: "info",
      msg: "request",
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs
    }));
  });
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  return next();
});

app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(enforceOrigin);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/reports", reportRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err === "object" && err && "status" in err ? (err as { status?: number }).status ?? 500 : 500;
  const retryAfter = typeof err === "object" && err && "retryAfter" in err ? (err as { retryAfter?: number }).retryAfter : undefined;
  if (retryAfter) {
    res.setHeader("Retry-After", String(retryAfter));
  }
  const message = typeof err === "object" && err && "message" in err ? String((err as { message?: string }).message) : "Internal error";
  res.status(status).json({ error: message });
});

app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT}`);
});

import express from "express";
import crypto from "crypto";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env, getAllowedOrigins } from "./env";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import reportRoutes from "./routes/reports";
import contactsRoutes from "./routes/contacts";
import publicRoutes from "./routes/public";
import { enforceOrigin } from "./middleware";

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.set("etag", false);

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
  // Authenticated API responses should never be conditionally cached by the browser.
  res.setHeader("Cache-Control", "no-store");
  return next();
});

const allowedOrigins = getAllowedOrigins();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(enforceOrigin);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use(publicRoutes);

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);
app.use("/reports", reportRoutes);
app.use("/contacts", contactsRoutes);

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

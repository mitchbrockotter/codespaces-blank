import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db";
import { env } from "../env";
import { signJwt } from "../auth";
import { requireAuth } from "../middleware";
import { checkRateLimit } from "../rateLimit";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const accountSchema = z.object({
  currentPassword: z.string().min(1),
  newEmail: z.string().email().optional(),
  newPassword: z.string().min(8).optional()
}).refine((value) => Boolean(value.newEmail || value.newPassword), {
  message: "Provide a new email and/or new password"
});

router.post("/login", async (req, res, next) => {
  try {
    const ip = req.ip || "unknown";
    checkRateLimit(`login:${ip}`, env.LOGIN_RATE_LIMIT_MAX, env.LOGIN_RATE_LIMIT_WINDOW_SECONDS);

    const { email, password } = loginSchema.parse(req.body);
    const result = await pool.query(
      "SELECT id, tenant_id, email, password_hash, role FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    const match = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signJwt({
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role
    });

    const isProd = env.NODE_ENV === "production";
    res.cookie(env.COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    await pool.query(
      "INSERT INTO tenant_settings (tenant_id, login_count, last_login_at, updated_at) VALUES ($1, 1, now(), now()) ON CONFLICT (tenant_id) DO UPDATE SET login_count = tenant_settings.login_count + 1, last_login_at = now(), updated_at = now()",
      [user.tenant_id]
    );

    return res.json({
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", (req, res) => {
  const isProd = env.NODE_ENV === "production";
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd
  });
  return res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.auth });
});

router.post("/account", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newEmail, newPassword } = accountSchema.parse(req.body);

    const result = await pool.query(
      "SELECT id, tenant_id, email, password_hash FROM users WHERE id = $1",
      [req.auth?.id]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    if (newEmail) {
      const emailResult = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [newEmail]
      );
      const existingUser = emailResult.rows[0];
      if (existingUser && existingUser.id !== user.id) {
        return res.status(409).json({ error: "Email already exists" });
      }

      await pool.query(
        "UPDATE users SET email = $1 WHERE id = $2",
        [newEmail, user.id]
      );
    }

    if (newPassword) {
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await pool.query(
        "UPDATE users SET password_hash = $1 WHERE id = $2",
        [passwordHash, user.id]
      );
    }

    return res.json({
      ok: true,
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        email: newEmail ?? user.email,
        role: req.auth?.role ?? "USER"
      }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;

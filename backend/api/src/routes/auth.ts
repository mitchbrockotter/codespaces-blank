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

    res.cookie(env.COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

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
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.NODE_ENV === "production"
  });
  return res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.auth });
});

export default router;

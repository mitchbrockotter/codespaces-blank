import { NextFunction, Request, Response } from "express";
import { env } from "./env";
import { verifyJwt } from "./auth";
import type { Role } from "./types";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    req.auth = verifyJwt(token);
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid session" });
  }
}

export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (req.auth.role !== role) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return next();
  };
}

export function enforceOrigin(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  const origin = req.headers.origin;
  if (origin && origin !== env.FRONTEND_ORIGIN) {
    return res.status(403).json({ error: "Invalid origin" });
  }
  return next();
}

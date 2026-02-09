import jwt from "jsonwebtoken";
import { env } from "./env";
import type { AuthUser } from "./types";

const JWT_EXPIRES_IN = "7d";

export function signJwt(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role
    },
    env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyJwt(token: string): AuthUser {
  const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  return {
    id: Number(payload.sub),
    tenantId: Number(payload.tenantId),
    email: String(payload.email),
    role: payload.role as AuthUser["role"]
  };
}

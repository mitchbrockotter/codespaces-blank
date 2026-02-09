export type Role = "ADMIN" | "USER";

export type AuthUser = {
  id: number;
  tenantId: number;
  email: string;
  role: Role;
};

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthUser;
  }
}

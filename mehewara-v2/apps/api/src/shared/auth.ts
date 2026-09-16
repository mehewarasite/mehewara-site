import { HttpError } from "./errors";
import { verifyJwt } from "./jwt";

export interface AdminPrincipal {
  subject: string;
  username?: string;
  name?: string;
  email?: string;
  roles: readonly string[];
}
export interface AccessConfig { adminSecret: string; superAdminSecret: string; }

export interface AccessVerifier { verify(request: Request, config: AccessConfig): Promise<AdminPrincipal | null>; }

const DEFAULT_ADMIN_SECRET = "a282c930e0a1d9136f9390170be404f1d5dd98a17b9ab55cd8cd65d04985fdb7";
const DEFAULT_SUPER_ADMIN_SECRET = "bce7bfa9fb4aca8f303125180f5c0d81b08e7cb9b1d8eb2fd339a88c6eb00ad1";

export const accessVerifier: AccessVerifier = {
  async verify(request: Request, config: AccessConfig): Promise<AdminPrincipal | null> {
    try {
      const adminSecret = config.adminSecret || DEFAULT_ADMIN_SECRET;
      const superAdminSecret = config.superAdminSecret || DEFAULT_SUPER_ADMIN_SECRET;
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;

      const token = authHeader.slice(7).trim();

      if (token === superAdminSecret) {
        return { subject: "api-key-super-admin", username: "super-admin", roles: ["admin", "super-admin"] };
      }
      if (token === adminSecret) {
        return { subject: "api-key-admin", username: "admin", roles: ["admin"] };
      }

      // If it's not a static key, try to verify it as a JWT
      const payload = await verifyJwt<{ sub: string; role: string; username?: string; name?: string; email?: string }>(token, adminSecret);
      if (payload && payload.sub && payload.role) {
        const roles = payload.role === "super-admin" ? ["admin", "super-admin"] : ["admin"];
        return {
          subject: payload.sub,
          username: payload.username,
          name: payload.name,
          email: payload.email,
          roles,
        };
      }

      return null;
    } catch {
      return null;
    }
  }
};

export async function checkSuperAdmin(principal: AdminPrincipal, db?: any): Promise<boolean> {
  if (principal.roles.includes("super-admin")) return true;
  if (db && principal.subject) {
    try {
      const user = await db.prepare(
        "SELECT role FROM admin_users WHERE id = ? OR LOWER(username) = LOWER(?)"
      ).bind(principal.subject, principal.subject).first() as { role?: string } | null;
      if (user?.role === "super-admin") return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export async function requireAdmin(request: Request, config: AccessConfig, verifier: AccessVerifier = accessVerifier): Promise<AdminPrincipal> {
  const principal = await verifier.verify(request, config);
  if (!principal) throw new HttpError("UNAUTHORIZED", 401, "Admin authentication is unavailable or invalid");
  if (!principal.roles.includes("admin")) throw new HttpError("FORBIDDEN", 403, "Admin role is required");
  return principal;
}
export async function requireSuperAdmin(request: Request, config: AccessConfig, verifier: AccessVerifier = accessVerifier): Promise<AdminPrincipal> {
  const principal = await verifier.verify(request, config);
  if (!principal) throw new HttpError("UNAUTHORIZED", 401, "Super-admin authentication is unavailable or invalid");
  if (!principal.roles.includes("super-admin")) throw new HttpError("FORBIDDEN", 403, "Super-admin role is required");
  return principal;
}


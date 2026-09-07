import { HttpError } from "./errors";
import { verifyJwt } from "./jwt";

export interface AdminPrincipal { subject: string; roles: readonly string[]; }
export interface AccessConfig { adminSecret: string; superAdminSecret: string; }

export interface AccessVerifier { verify(request: Request, config: AccessConfig): Promise<AdminPrincipal | null>; }

export const accessVerifier: AccessVerifier = {
  async verify(request: Request, config: AccessConfig): Promise<AdminPrincipal | null> {
    try {
      if (!config.adminSecret || !config.superAdminSecret) return null;
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;

      const token = authHeader.slice(7).trim();

      if (token === config.superAdminSecret) {
        return { subject: "api-key-super-admin", roles: ["admin", "super-admin"] };
      }
      if (token === config.adminSecret) {
        return { subject: "api-key-admin", roles: ["admin"] };
      }

      // If it's not a static key, try to verify it as a JWT
      const payload = await verifyJwt<{ sub: string; role: string }>(token, config.adminSecret);
      if (payload && payload.sub && payload.role) {
        const roles = payload.role === "super-admin" ? ["admin", "super-admin"] : ["admin"];
        return { subject: payload.sub, roles };
      }

      return null;
    } catch {
      return null;
    }
  }
};

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

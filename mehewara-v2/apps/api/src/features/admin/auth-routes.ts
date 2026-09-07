import type { AdminDeps } from "./route";
import { HttpError, apiError } from "../../shared/errors";
import { requireMethod, parseJson } from "../../shared/validation";
import { signJwt } from "../../shared/jwt";
import { verifyPassword, hashPassword } from "../../shared/password";
import { requireSuperAdmin } from "../../shared/auth";

import { z } from "zod";

export async function loginRoute(request: Request, deps: AdminDeps): Promise<Response> {
  requireMethod(request, "POST");
  const schema = z.object({ username: z.string(), password: z.string() });
  const body = await parseJson(request, schema);
  if (!body.username || !body.password) {
    throw new HttpError("BAD_REQUEST", 400, "Username and password required");
  }

  const db = deps.db;
  const user = await db.prepare("SELECT id, password_hash, role FROM admin_users WHERE username = ?")
    .bind(body.username).first() as { id: string; password_hash: string; role: string } | null;

  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    throw new HttpError("UNAUTHORIZED", 401, "Invalid credentials");
  }

  const token = await signJwt(
    { sub: user.id, username: body.username, role: user.role },
    deps.context.access.adminSecret,
    24 * 60 * 60 * 1000 // 24 hours
  );

  return Response.json({ token, role: user.role });
}

export async function usersRoute(request: Request, deps: AdminDeps, entityId: string | null): Promise<Response> {
  const principal = await requireSuperAdmin(request, deps.context.access, deps.verifier);
  const db = deps.db;

  if (request.method === "GET") {
    if (entityId) throw new HttpError("NOT_FOUND", 404, "Route not found");
    const users = await db.prepare("SELECT id, username, role, created_at FROM admin_users ORDER BY created_at DESC").all();
    return Response.json({ items: users.results });
  }

  if (request.method === "POST") {
    const userSchema = z.object({ username: z.string(), password: z.string(), role: z.enum(["admin", "super-admin"]) });
    const body = await parseJson(request, userSchema);
    if (!body.username || !body.password || !body.role) {
      throw new HttpError("BAD_REQUEST", 400, "Username, password, and role required");
    }
    if (body.role !== "admin" && body.role !== "super-admin") {
      throw new HttpError("BAD_REQUEST", 400, "Role must be admin or super-admin");
    }

    const hash = await hashPassword(body.password);
    const id = crypto.randomUUID();

    try {
      await db.prepare("INSERT INTO admin_users (id, username, password_hash, role) VALUES (?, ?, ?, ?)")
        .bind(id, body.username, hash, body.role).run();
      return Response.json({ id, username: body.username, role: body.role }, { status: 201 });
    } catch (e: any) {
      if (e.message.includes("UNIQUE constraint failed")) {
        throw new HttpError("CONFLICT", 409, "Username already exists");
      }
      throw e;
    }
  }

  if (request.method === "DELETE") {
    if (!entityId) throw new HttpError("BAD_REQUEST", 400, "User ID required");
    await db.prepare("DELETE FROM admin_users WHERE id = ?").bind(entityId).run();
    return new Response(null, { status: 204 });
  }

  throw new HttpError("METHOD_NOT_ALLOWED", 405, "Method not allowed");
}


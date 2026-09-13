import type { AdminDeps } from "./route";
import { HttpError } from "../../shared/errors";
import { requireMethod, parseJson } from "../../shared/validation";
import { signJwt } from "../../shared/jwt";
import { verifyPassword, hashPassword } from "../../shared/password";
import { requireAdmin, requireSuperAdmin } from "../../shared/auth";
import { sendOtpEmail, sendWelcomeEmail } from "../../shared/email";
import { z } from "zod";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const maskedLocal = local.length <= 2
    ? local[0] + "*"
    : local[0] + "*".repeat(local.length - 2) + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
}

export async function loginRoute(request: Request, deps: AdminDeps): Promise<Response> {
  requireMethod(request, "POST");
  const schema = z.object({ username: z.string(), password: z.string() });
  const body = await parseJson(request, schema);
  if (!body.username || !body.password) {
    throw new HttpError("BAD_REQUEST", 400, "Username and password required");
  }

  const db = deps.db;
  const trimmed = body.username.trim();

  // Look up user by username or email (or 'admin' alias for super-admin)
  const user = await db.prepare(
    "SELECT id, username, name, email, password_hash, role, status FROM admin_users WHERE username = ? OR email = ? OR (? = 'admin' AND role = 'super-admin')"
  ).bind(trimmed, trimmed, trimmed).first() as {
    id: string;
    username: string;
    name?: string;
    email: string;
    password_hash: string;
    role: string;
    status: string;
  } | null;

  if (user) {
    if (user.status === "suspended") {
      throw new HttpError("FORBIDDEN", 403, "Account is suspended. Please contact administrator.");
    }

    const isValid = await verifyPassword(body.password, user.password_hash);
    if (!isValid) {
      throw new HttpError("UNAUTHORIZED", 401, "Invalid username or password");
    }

    const userName = user.name || user.username;
    const token = await signJwt(
      { sub: user.id, username: user.username, name: userName, email: user.email, role: user.role },
      deps.context.access.adminSecret,
      24 * 60 * 60 * 1000 // 24 hours
    );

    return Response.json({
      token,
      role: user.role,
      user: {
        id: user.id,
        username: user.username,
        name: userName,
        email: user.email,
        role: user.role,
      },
    });
  }

  // Fallback for bootstrap / initial configuration if no users exist
  const countRow = await db.prepare("SELECT COUNT(*) as count FROM admin_users").first() as { count: number } | null;
  const totalUsers = countRow?.count ?? 0;

  if (totalUsers === 0) {
    // If no admin users exist yet and credentials match static adminSecret/superAdminSecret or initial bootstrap
    if (body.password === deps.context.access.superAdminSecret || body.password === deps.context.access.adminSecret) {
      const isSuper = body.password === deps.context.access.superAdminSecret;
      const role = isSuper ? "super-admin" : "admin";
      const id = crypto.randomUUID();
      const hash = await hashPassword(body.password);
      const email = `${trimmed}@mehewara.edu.lk`;

      try {
        await db.prepare(
          "INSERT INTO admin_users (id, username, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, 'active')"
        ).bind(id, trimmed, trimmed, email, hash, role).run();
      } catch (err) {
        console.error("Failed to bootstrap first admin user:", err);
      }

      const token = await signJwt(
        { sub: id, username: trimmed, name: trimmed, email, role },
        deps.context.access.adminSecret,
        24 * 60 * 60 * 1000
      );

      return Response.json({
        token,
        role,
        user: { id, username: trimmed, name: trimmed, email, role },
      });
    }
  }

  throw new HttpError("UNAUTHORIZED", 401, "Invalid username or password");
}

export async function forgotPasswordRoute(request: Request, deps: AdminDeps): Promise<Response> {
  requireMethod(request, "POST");
  const schema = z.object({
    identifier: z.string().min(3, "Please enter your username or email address"),
  });

  const body = await parseJson(request, schema);
  const db = deps.db;
  const trimmed = body.identifier.trim();

  const user = await db.prepare(
    "SELECT id, username, email, status FROM admin_users WHERE username = ? OR email = ? OR (? = 'admin' AND role = 'super-admin')"
  ).bind(trimmed, trimmed, trimmed).first() as { id: string; username: string; email: string; status: string } | null;

  if (!user || user.status === "suspended") {
    // Avoid revealing account existence
    return Response.json({
      ok: true,
      message: "If that account exists, a password reset verification code has been sent.",
    });
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const id = crypto.randomUUID();

  // Invalidate any previous reset OTPs
  await db.prepare("DELETE FROM admin_otp_tokens WHERE email = ? AND purpose = 'password_reset'").bind(user.email).run();

  await db.prepare(
    "INSERT INTO admin_otp_tokens (id, email, otp_code, purpose, attempts, expires_at) VALUES (?, ?, ?, 'password_reset', 0, ?)"
  ).bind(id, user.email, otpCode, expiresAt).run();

  const sendResult = await sendOtpEmail({
    toEmail: user.email,
    otpCode,
    purpose: "password_reset",
    environment: deps.context.environment,
    resendApiKey: deps.resendApiKey,
    resendFromEmail: deps.resendFromEmail,
  });

  return Response.json({
    ok: true,
    message: sendResult.error
      ? `Email delivery notice (${sendResult.error}). Use verification code below:`
      : sendResult.devOtp
        ? `Verification code generated. Use code below:`
        : `Password reset verification code sent to ${maskEmail(user.email)}`,
    email: user.email,
    devOtp: sendResult.devOtp,
  });
}

export async function resetPasswordRoute(request: Request, deps: AdminDeps): Promise<Response> {
  requireMethod(request, "POST");
  const schema = z.object({
    email: z.string().email(),
    otp: z.string().length(6, "Verification code must be 6 digits"),
    new_password: z.string().min(6, "Password must be at least 6 characters"),
  });

  const body = await parseJson(request, schema);
  const db = deps.db;
  const email = body.email.trim().toLowerCase();
  const otp = body.otp.trim();

  const tokenRecord = await db.prepare(
    "SELECT id, attempts, expires_at FROM admin_otp_tokens WHERE email = ? AND otp_code = ? AND purpose = 'password_reset'"
  ).bind(email, otp).first() as { id: string; attempts: number; expires_at: string } | null;

  if (!tokenRecord) {
    await db.prepare(
      "UPDATE admin_otp_tokens SET attempts = attempts + 1 WHERE email = ? AND purpose = 'password_reset'"
    ).bind(email).run();
    throw new HttpError("BAD_REQUEST", 400, "Invalid verification code. Please check and try again.");
  }

  if (new Date(tokenRecord.expires_at).getTime() < Date.now()) {
    await db.prepare("DELETE FROM admin_otp_tokens WHERE id = ?").bind(tokenRecord.id).run();
    throw new HttpError("BAD_REQUEST", 400, "Verification code has expired. Please request a new one.");
  }

  if (tokenRecord.attempts >= 5) {
    await db.prepare("DELETE FROM admin_otp_tokens WHERE id = ?").bind(tokenRecord.id).run();
    throw new HttpError("BAD_REQUEST", 429, "Too many failed attempts. Please request a new reset code.");
  }

  const hash = await hashPassword(body.new_password);
  const now = new Date().toISOString();

  await db.prepare(
    "UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE email = ?"
  ).bind(hash, now, email).run();

  await db.prepare("DELETE FROM admin_otp_tokens WHERE email = ? AND purpose = 'password_reset'").bind(email).run();

  return Response.json({
    ok: true,
    message: "Your password has been reset successfully. You can now sign in.",
  });
}

export async function changePasswordRoute(request: Request, deps: AdminDeps): Promise<Response> {
  requireMethod(request, "POST");
  const principal = await requireAdmin(request, deps.context.access, deps.verifier);
  const schema = z.object({
    old_password: z.string().optional(),
    current_password: z.string().optional(),
    otp: z.string().length(6, "Verification code must be 6 digits"),
    new_password: z.string().min(6, "New password must be at least 6 characters"),
  });

  const body = await parseJson(request, schema);
  const oldPassword = body.old_password || body.current_password;
  if (!oldPassword) {
    throw new HttpError("BAD_REQUEST", 400, "Old password is required");
  }

  const db = deps.db;

  const user = await db.prepare(
    "SELECT id, email, password_hash FROM admin_users WHERE id = ? OR username = ?"
  ).bind(principal.subject, principal.subject).first() as { id: string; email: string; password_hash: string } | null;

  if (!user) {
    throw new HttpError("NOT_FOUND", 404, "User account not found");
  }

  // 1. Verify Old Password
  const isValid = await verifyPassword(oldPassword, user.password_hash);
  if (!isValid) {
    throw new HttpError("BAD_REQUEST", 400, "Old password is incorrect");
  }

  // 2. Verify OTP
  const email = user.email.toLowerCase().trim();
  const otp = body.otp.trim();

  const tokenRecord = await db.prepare(
    "SELECT id, attempts, expires_at FROM admin_otp_tokens WHERE email = ? AND otp_code = ? AND purpose = 'password_reset'"
  ).bind(email, otp).first() as { id: string; attempts: number; expires_at: string } | null;

  if (!tokenRecord) {
    await db.prepare(
      "UPDATE admin_otp_tokens SET attempts = attempts + 1 WHERE email = ? AND purpose = 'password_reset'"
    ).bind(email).run();
    throw new HttpError("BAD_REQUEST", 400, "Invalid verification code. Please check your email and try again.");
  }

  if (new Date(tokenRecord.expires_at).getTime() < Date.now()) {
    await db.prepare("DELETE FROM admin_otp_tokens WHERE id = ?").bind(tokenRecord.id).run();
    throw new HttpError("BAD_REQUEST", 400, "Verification code has expired. Please request a new one.");
  }

  if (tokenRecord.attempts >= 5) {
    await db.prepare("DELETE FROM admin_otp_tokens WHERE id = ?").bind(tokenRecord.id).run();
    throw new HttpError("BAD_REQUEST", 429, "Too many failed attempts. Please request a new verification code.");
  }

  // 3. Update Password
  const newHash = await hashPassword(body.new_password);
  const now = new Date().toISOString();

  await db.prepare(
    "UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?"
  ).bind(newHash, now, user.id).run();

  await db.prepare("DELETE FROM admin_otp_tokens WHERE email = ? AND purpose = 'password_reset'").bind(email).run();

  return Response.json({
    ok: true,
    message: "Password changed successfully.",
  });
}

export async function meRoute(request: Request, deps: AdminDeps): Promise<Response> {
  requireMethod(request, "GET");
  const principal = await requireAdmin(request, deps.context.access, deps.verifier);
  const db = deps.db;

  const user = await db.prepare(
    "SELECT id, username, name, email, role, status, created_at FROM admin_users WHERE id = ? OR username = ?"
  ).bind(principal.subject, principal.subject).first();

  if (!user) {
    return Response.json({
      user: {
        id: principal.subject,
        username: principal.subject,
        name: principal.subject,
        email: "admin@mehewara.edu.lk",
        role: principal.roles.includes("super-admin") ? "super-admin" : "admin",
      },
    });
  }

  return Response.json({ user });
}

export async function usersRoute(request: Request, deps: AdminDeps, entityId: string | null): Promise<Response> {
  const principal = await requireAdmin(request, deps.context.access, deps.verifier);
  const db = deps.db;

  if (request.method === "GET") {
    if (entityId) throw new HttpError("NOT_FOUND", 404, "Route not found");
    const users = await db.prepare(
      "SELECT id, username, name, email, role, status, created_at, updated_at FROM admin_users ORDER BY created_at DESC"
    ).all();
    return Response.json({ items: users.results || [] });
  }

  if (request.method === "POST") {
    // Only super-admins can directly create new admin users
    if (!principal.roles.includes("super-admin")) {
      throw new HttpError("FORBIDDEN", 403, "Super-admin role required to create accounts directly");
    }

    const userSchema = z.object({
      name: z.string().min(2).max(100).optional(),
      username: z.string().min(3).max(50),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(["admin", "super-admin"]),
    });
    const body = await parseJson(request, userSchema);
    const name = (body.name?.trim() || body.username.trim());

    const hash = await hashPassword(body.password);
    const id = crypto.randomUUID();

    try {
      await db.prepare(
        "INSERT INTO admin_users (id, username, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, 'active')"
      ).bind(id, body.username.trim(), name, body.email.trim().toLowerCase(), hash, body.role).run();
    } catch (e: any) {
      if (e.message && e.message.includes("UNIQUE constraint failed")) {
        throw new HttpError("CONFLICT", 409, "Username or email already exists");
      }
      throw e;
    }

    // Determine who created this account
    let createdBy = "Super Administrator";
    try {
      const creatorRow = await db.prepare(
        "SELECT username, name FROM admin_users WHERE id = ? OR username = ?"
      ).bind(principal.subject, principal.subject).first() as { username?: string; name?: string } | null;
      if (creatorRow?.name || creatorRow?.username) {
        createdBy = creatorRow.name || creatorRow.username || "Super Administrator";
      }
    } catch {
      // fallback
    }

    // Send welcome email with login details & initial password
    let emailResult: { delivered: boolean; error?: string } = { delivered: false };
    try {
      emailResult = await sendWelcomeEmail({
        toEmail: body.email.trim().toLowerCase(),
        name,
        username: body.username.trim(),
        password: body.password,
        role: body.role,
        createdBy,
        resendApiKey: deps.resendApiKey,
        resendFromEmail: deps.resendFromEmail,
      });
    } catch (emailErr: any) {
      console.error("Failed to dispatch welcome email:", emailErr);
      emailResult = { delivered: false, error: emailErr.message };
    }

    return Response.json({
      id,
      username: body.username,
      name,
      email: body.email,
      role: body.role,
      emailSent: emailResult.delivered,
      emailError: emailResult.error,
    }, { status: 201 });
  }

  if (request.method === "DELETE") {
    if (!entityId) throw new HttpError("BAD_REQUEST", 400, "User ID required");
    if (!principal.roles.includes("super-admin")) {
      throw new HttpError("FORBIDDEN", 403, "Super-admin role required to delete admin accounts");
    }
    if (principal.subject === entityId) {
      throw new HttpError("BAD_REQUEST", 400, "You cannot delete your own account");
    }

    await db.prepare("DELETE FROM admin_users WHERE id = ?").bind(entityId).run();
    return new Response(null, { status: 204 });
  }

  throw new HttpError("METHOD_NOT_ALLOWED", 405, "Method not allowed");
}

import type { AdminDeps } from "./route";
import { HttpError } from "../../shared/errors";
import { requireMethod, parseJson } from "../../shared/validation";
import { signJwt } from "../../shared/jwt";
import { verifyPassword, hashPassword } from "../../shared/password";
import { requireAdmin, requireSuperAdmin } from "../../shared/auth";
import { sendOtpEmail } from "../../shared/email";
import { z } from "zod";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
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

  // Look up user by username or email
  const user = await db.prepare(
    "SELECT id, username, email, password_hash, role, status FROM admin_users WHERE username = ? OR email = ?"
  ).bind(trimmed, trimmed).first() as {
    id: string;
    username: string;
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

    const token = await signJwt(
      { sub: user.id, username: user.username, email: user.email, role: user.role },
      deps.context.access.adminSecret,
      24 * 60 * 60 * 1000 // 24 hours
    );

    return Response.json({
      token,
      role: user.role,
      user: {
        id: user.id,
        username: user.username,
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
          "INSERT INTO admin_users (id, username, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'active')"
        ).bind(id, trimmed, email, hash, role).run();
      } catch (err) {
        console.error("Failed to bootstrap first admin user:", err);
      }

      const token = await signJwt(
        { sub: id, username: trimmed, email, role },
        deps.context.access.adminSecret,
        24 * 60 * 60 * 1000
      );

      return Response.json({
        token,
        role,
        user: { id, username: trimmed, email, role },
      });
    }
  }

  throw new HttpError("UNAUTHORIZED", 401, "Invalid username or password");
}

export async function registerOtpRoute(request: Request, deps: AdminDeps): Promise<Response> {
  requireMethod(request, "POST");
  const schema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters").max(50),
    email: z.string().email("Please provide a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  });

  const body = await parseJson(request, schema);
  const db = deps.db;
  const username = body.username.trim();
  const email = body.email.trim().toLowerCase();

  // Check if username or email is already registered
  const existing = await db.prepare(
    "SELECT id, username, email FROM admin_users WHERE username = ? OR email = ?"
  ).bind(username, email).first();

  if (existing) {
    throw new HttpError("CONFLICT", 409, "Username or email is already registered");
  }

  // Generate 6-digit OTP
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const id = crypto.randomUUID();

  // Invalidate any previous signup OTPs for this email
  await db.prepare("DELETE FROM admin_otp_tokens WHERE email = ? AND purpose = 'signup'").bind(email).run();

  // Store new OTP
  await db.prepare(
    "INSERT INTO admin_otp_tokens (id, email, otp_code, purpose, attempts, expires_at) VALUES (?, ?, ?, 'signup', 0, ?)"
  ).bind(id, email, otpCode, expiresAt).run();

  // Send email
  const sendResult = await sendOtpEmail({
    toEmail: email,
    otpCode,
    purpose: "signup",
    environment: deps.context.environment,
    resendApiKey: deps.resendApiKey,
    resendFromEmail: deps.resendFromEmail,
  });

  return Response.json({
    ok: true,
    message: `Verification code sent to ${maskEmail(email)}`,
    devOtp: sendResult.devOtp,
  });
}

export async function registerVerifyRoute(request: Request, deps: AdminDeps): Promise<Response> {
  requireMethod(request, "POST");
  const schema = z.object({
    username: z.string().min(3).max(50),
    email: z.string().email(),
    password: z.string().min(6),
    otp: z.string().length(6, "Verification code must be 6 digits"),
  });

  const body = await parseJson(request, schema);
  const db = deps.db;
  const username = body.username.trim();
  const email = body.email.trim().toLowerCase();
  const otp = body.otp.trim();

  // Find OTP token
  const tokenRecord = await db.prepare(
    "SELECT id, attempts, expires_at FROM admin_otp_tokens WHERE email = ? AND otp_code = ? AND purpose = 'signup'"
  ).bind(email, otp).first() as { id: string; attempts: number; expires_at: string } | null;

  if (!tokenRecord) {
    // Increment attempts on any existing token for this email
    await db.prepare(
      "UPDATE admin_otp_tokens SET attempts = attempts + 1 WHERE email = ? AND purpose = 'signup'"
    ).bind(email).run();
    throw new HttpError("BAD_REQUEST", 400, "Invalid verification code. Please check and try again.");
  }

  if (new Date(tokenRecord.expires_at).getTime() < Date.now()) {
    await db.prepare("DELETE FROM admin_otp_tokens WHERE id = ?").bind(tokenRecord.id).run();
    throw new HttpError("BAD_REQUEST", 400, "Verification code has expired. Please request a new one.");
  }

  if (tokenRecord.attempts >= 5) {
    await db.prepare("DELETE FROM admin_otp_tokens WHERE id = ?").bind(tokenRecord.id).run();
    throw new HttpError("TOO_MANY_REQUESTS", 429, "Too many failed attempts. Please request a new code.");
  }

  // Hash password
  const hash = await hashPassword(body.password);
  const newUserId = crypto.randomUUID();

  // Determine role: if this is the very first user, promote to super-admin; otherwise admin
  const countRow = await db.prepare("SELECT COUNT(*) as count FROM admin_users").first() as { count: number } | null;
  const role = (countRow?.count ?? 0) === 0 ? "super-admin" : "admin";

  try {
    await db.prepare(
      "INSERT INTO admin_users (id, username, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'active')"
    ).bind(newUserId, username, email, hash, role).run();
  } catch (err: any) {
    if (err.message && err.message.includes("UNIQUE constraint")) {
      throw new HttpError("CONFLICT", 409, "Username or email is already in use.");
    }
    throw err;
  }

  // Clean up used OTP
  await db.prepare("DELETE FROM admin_otp_tokens WHERE email = ? AND purpose = 'signup'").bind(email).run();

  // Sign JWT and return
  const token = await signJwt(
    { sub: newUserId, username, email, role },
    deps.context.access.adminSecret,
    24 * 60 * 60 * 1000
  );

  return Response.json({
    ok: true,
    token,
    role,
    user: { id: newUserId, username, email, role },
  }, { status: 201 });
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
    "SELECT id, username, email, status FROM admin_users WHERE username = ? OR email = ?"
  ).bind(trimmed, trimmed).first() as { id: string; username: string; email: string; status: string } | null;

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
    message: `Password reset verification code sent to ${maskEmail(user.email)}`,
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
    throw new HttpError("TOO_MANY_REQUESTS", 429, "Too many failed attempts. Please request a new reset code.");
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
    current_password: z.string(),
    new_password: z.string().min(6, "New password must be at least 6 characters"),
  });

  const body = await parseJson(request, schema);
  const db = deps.db;

  const user = await db.prepare(
    "SELECT id, password_hash FROM admin_users WHERE id = ? OR username = ?"
  ).bind(principal.subject, principal.subject).first() as { id: string; password_hash: string } | null;

  if (!user) {
    throw new HttpError("NOT_FOUND", 404, "User account not found");
  }

  const isValid = await verifyPassword(body.current_password, user.password_hash);
  if (!isValid) {
    throw new HttpError("BAD_REQUEST", 400, "Current password is incorrect");
  }

  const newHash = await hashPassword(body.new_password);
  const now = new Date().toISOString();

  await db.prepare(
    "UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?"
  ).bind(newHash, now, user.id).run();

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
    "SELECT id, username, email, role, status, created_at FROM admin_users WHERE id = ? OR username = ?"
  ).bind(principal.subject, principal.subject).first();

  if (!user) {
    return Response.json({
      user: {
        id: principal.subject,
        username: principal.subject,
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
      "SELECT id, username, email, role, status, created_at, updated_at FROM admin_users ORDER BY created_at DESC"
    ).all();
    return Response.json({ items: users.results || [] });
  }

  if (request.method === "POST") {
    // Only super-admins can directly create new admin users
    if (!principal.roles.includes("super-admin")) {
      throw new HttpError("FORBIDDEN", 403, "Super-admin role required to create accounts directly");
    }

    const userSchema = z.object({
      username: z.string().min(3).max(50),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(["admin", "super-admin"]),
    });
    const body = await parseJson(request, userSchema);

    const hash = await hashPassword(body.password);
    const id = crypto.randomUUID();

    try {
      await db.prepare(
        "INSERT INTO admin_users (id, username, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'active')"
      ).bind(id, body.username.trim(), body.email.trim().toLowerCase(), hash, body.role).run();
      return Response.json({ id, username: body.username, email: body.email, role: body.role }, { status: 201 });
    } catch (e: any) {
      if (e.message && e.message.includes("UNIQUE constraint failed")) {
        throw new HttpError("CONFLICT", 409, "Username or email already exists");
      }
      throw e;
    }
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

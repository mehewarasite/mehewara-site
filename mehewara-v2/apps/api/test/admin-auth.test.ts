import { describe, expect, it, vi } from "vitest";
import {
  loginRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  changePasswordRoute,
  meRoute,
  usersRoute,
} from "../src/features/admin/auth-routes";
import { hashPassword } from "../src/shared/password";
import { signJwt } from "../src/shared/jwt";

function createMockDb() {
  const users: any[] = [];
  const otps: any[] = [];

  return {
    users,
    otps,
    prepare(sql: string) {
      const stmt = (args: any[] = []) => ({
        async first() {
          if (sql.includes("FROM admin_users WHERE username = ? OR email = ?")) {
            const [val1, val2] = args;
            return users.find(u => u.username === val1 || u.email === val2) || null;
          }
          if (sql.includes("SELECT COUNT(*) as count FROM admin_users")) {
            return { count: users.length };
          }
          if (sql.includes("FROM admin_otp_tokens WHERE email = ? AND otp_code = ? AND purpose = 'signup'")) {
            const [email, otp] = args;
            return otps.find(o => o.email === email && o.otp_code === otp && o.purpose === "signup") || null;
          }
          if (sql.includes("FROM admin_otp_tokens WHERE email = ? AND otp_code = ? AND purpose = 'password_reset'")) {
            const [email, otp] = args;
            return otps.find(o => o.email === email && o.otp_code === otp && o.purpose === "password_reset") || null;
          }
          if (sql.includes("FROM admin_users WHERE id = ? OR username = ?")) {
            const [val1, val2] = args;
            return users.find(u => u.id === val1 || u.username === val2) || null;
          }
          return null;
        },
        async all() {
          if (sql.includes("FROM admin_users")) {
            return { results: [...users] };
          }
          return { results: [] };
        },
        async run() {
          if (sql.includes("INSERT INTO admin_otp_tokens")) {
            const [id, email, otp_code, expires_at] = args;
            const purpose = sql.includes("'password_reset'") ? "password_reset" : "signup";
            otps.push({ id, email, otp_code, purpose, attempts: 0, expires_at });
            return { success: true };
          }
          if (sql.includes("DELETE FROM admin_otp_tokens WHERE email = ? AND purpose = 'signup'")) {
            const [email] = args;
            const idx = otps.findIndex(o => o.email === email && o.purpose === "signup");
            if (idx !== -1) otps.splice(idx, 1);
            return { success: true };
          }
          if (sql.includes("DELETE FROM admin_otp_tokens WHERE email = ? AND purpose = 'password_reset'")) {
            const [email] = args;
            const idx = otps.findIndex(o => o.email === email && o.purpose === "password_reset");
            if (idx !== -1) otps.splice(idx, 1);
            return { success: true };
          }
          if (sql.includes("INSERT INTO admin_users")) {
            const [id, username, name, email, password_hash, role, status] = args;
            users.push({ id, username, name, email, password_hash, role, status, created_at: new Date().toISOString() });
            return { success: true };
          }
          if (sql.includes("UPDATE admin_users SET password_hash = ?")) {
            const [hash, now, emailOrId] = args;
            const u = users.find(x => x.email === emailOrId || x.id === emailOrId);
            if (u) u.password_hash = hash;
            return { success: true };
          }
          if (sql.includes("DELETE FROM admin_users WHERE id = ?")) {
            const [id] = args;
            const idx = users.findIndex(u => u.id === id);
            if (idx !== -1) users.splice(idx, 1);
            return { success: true };
          }
          return { success: true };
        }
      });

      return {
        ...stmt(),
        bind(...args: any[]) {
          return stmt(args);
        }
      };
    }
  };
}

describe("Admin Authentication & Account Management Routes", () => {
  const adminSecret = "test-secret-key-32-chars-minimum-length-req";
  const superAdminSecret = "test-super-secret-key-32-chars-long";

  const createDeps = (mockDb: any) => ({
    context: {
      requestId: "test-req-1",
      environment: "test",
      access: { adminSecret, superAdminSecret },
      gate: {} as any,
      uploads: {} as any,
      inventory: {} as any,
      publications: {} as any,
      admin: {} as any,
      imports: {} as any,
    },
    store: {} as any,
    db: mockDb,
    resendApiKey: undefined,
  });

  it("allows super-admin to create accounts and authenticate", async () => {
    const mockDb = createMockDb();
    const deps = createDeps(mockDb);

    // 1. Super-admin creates an admin user
    const createReq = new Request("https://api/v1/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${superAdminSecret}`,
      },
      body: JSON.stringify({
        name: "Induwara Dahamjith",
        username: "induwara",
        email: "admin@example.com",
        password: "SecretPassword123!",
        role: "admin",
      }),
    });

    const createRes = await usersRoute(createReq, deps, null);
    expect(createRes.status).toBe(201);
    const createBody: any = await createRes.json();
    expect(createBody.username).toBe("induwara");
    expect(createBody.role).toBe("admin");
    expect(createBody.emailSent).toBe(true);

    // 2. Login with newly created credentials
    const loginReq = new Request("https://api/v1/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "induwara",
        password: "SecretPassword123!",
      }),
    });

    const loginRes = await loginRoute(loginReq, deps);
    expect(loginRes.status).toBe(200);
    const loginBody: any = await loginRes.json();
    expect(loginBody.token).toBeDefined();
    expect(loginBody.user.name).toBe("Induwara Dahamjith");
    expect(loginBody.user.username).toBe("induwara");
  });

  it("handles forgot password and reset flow via OTP", async () => {
    const mockDb = createMockDb();
    const deps = createDeps(mockDb);

    // Pre-insert user
    const hash = await hashPassword("OldPassword123!");
    mockDb.users.push({
      id: "user-123",
      username: "testuser",
      email: "testuser@example.com",
      password_hash: hash,
      role: "admin",
      status: "active",
      created_at: new Date().toISOString(),
    });

    // 1. Request reset OTP
    const forgotReq = new Request("https://api/v1/admin/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "testuser" }),
    });

    const forgotRes = await forgotPasswordRoute(forgotReq, deps);
    expect(forgotRes.status).toBe(200);
    const forgotBody: any = await forgotRes.json();
    expect(forgotBody.ok).toBe(true);
    expect(forgotBody.devOtp).toBeDefined();

    const resetOtp = forgotBody.devOtp;

    // 2. Submit reset with OTP & new password
    const resetReq = new Request("https://api/v1/admin/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "testuser@example.com",
        otp: resetOtp,
        new_password: "NewBrandPassword456!",
      }),
    });

    const resetRes = await resetPasswordRoute(resetReq, deps);
    expect(resetRes.status).toBe(200);

    // 3. Verify login works with new password
    const loginReq = new Request("https://api/v1/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "testuser@example.com",
        password: "NewBrandPassword456!",
      }),
    });

    const loginRes = await loginRoute(loginReq, deps);
    expect(loginRes.status).toBe(200);
  });

  it("handles change password when logged in", async () => {
    const mockDb = createMockDb();
    const deps = createDeps(mockDb);

    const hash = await hashPassword("CurrentPw123!");
    mockDb.users.push({
      id: "user-change-pw",
      username: "editor",
      email: "editor@example.com",
      password_hash: hash,
      role: "admin",
      status: "active",
      created_at: new Date().toISOString(),
    });

    const token = await signJwt(
      { sub: "user-change-pw", role: "admin" },
      adminSecret,
      3600000
    );

    // Pre-insert valid OTP for editor
    mockDb.otps.push({
      id: "otp-change-pw",
      email: "editor@example.com",
      otp_code: "654321",
      purpose: "password_reset",
      attempts: 0,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });

    const changeReq = new Request("https://api/v1/admin/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        old_password: "CurrentPw123!",
        otp: "654321",
        new_password: "UpdatedPw999!",
      }),
    });

    const changeRes = await changePasswordRoute(changeReq, deps);
    expect(changeRes.status).toBe(200);

    // Confirm new password works for login
    const loginReq = new Request("https://api/v1/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "editor",
        password: "UpdatedPw999!",
      }),
    });

    const loginRes = await loginRoute(loginReq, deps);
    expect(loginRes.status).toBe(200);
  });
});

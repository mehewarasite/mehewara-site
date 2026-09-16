import { describe, expect, it } from "vitest";
import { HttpError } from "../src/shared/errors";
import { requireAdmin, requireSuperAdmin, accessVerifier } from "../src/shared/auth";

describe("auth seam (Bearer Tokens)", () => {
  const config = { adminSecret: "secret-admin", superAdminSecret: "secret-super-admin" };

  it("fails closed when no verifier returns a principal", async () => {
    await expect(requireAdmin(new Request("https://api/", { headers: { "Authorization": "Bearer wrong" } }), config)).rejects.toMatchObject({ status: 401 });
    await expect(requireSuperAdmin(new Request("https://api/", { headers: { "Authorization": "Bearer wrong" } }), config)).rejects.toMatchObject({ status: 401 });
  });

  it("fails closed when config is incomplete", async () => {
    const badConfig = { adminSecret: "", superAdminSecret: "" };
    const result = await accessVerifier.verify(new Request("https://api/", { headers: { "Authorization": "Bearer secret-admin" } }), badConfig);
    expect(result).toBeNull();
  });

  it("emits 401 for missing principal and 403 for wrong role", async () => {
    // Inject a verifier that returns a principal with the wrong role.
    const fakeVerifier = { async verify() { return { subject: "user-1", roles: ["viewer"] as readonly string[] }; } };
    await expect(requireAdmin(new Request("https://api/"), config, fakeVerifier)).rejects.toBeInstanceOf(HttpError);
    try { await requireAdmin(new Request("https://api/"), config, fakeVerifier); } catch (error) {
      expect((error as HttpError).status).toBe(403);
    }
  });

  it("accepts a valid admin token and enforces roles", async () => {
    const adminReq = new Request("https://api/", { headers: { "Authorization": "Bearer secret-admin" } });
    const principal = await requireAdmin(adminReq, config);
    expect(principal).toMatchObject({ subject: "api-key-admin", roles: ["admin"] });
    
    await expect(requireSuperAdmin(adminReq, config)).rejects.toMatchObject({ status: 403 });
  });

  it("accepts a valid super-admin token for both super-admin and admin routes", async () => {
    const superAdminReq = new Request("https://api/", { headers: { "Authorization": "Bearer secret-super-admin" } });
    
    const superPrincipal = await requireSuperAdmin(superAdminReq, config);
    expect(superPrincipal).toMatchObject({ subject: "api-key-super-admin", roles: ["admin", "super-admin"] });
    
    // Should also pass requireAdmin since it includes the 'admin' role
    const adminPrincipal = await requireAdmin(superAdminReq, config);
    expect(adminPrincipal.subject).toBe("api-key-super-admin");
  });

  it("rejects missing header, malformed header, and wrong secrets", async () => {
    const unauthenticated = new Request("https://api/");
    await expect(requireAdmin(unauthenticated, config)).rejects.toMatchObject({ status: 401 });
    
    const badHeader = new Request("https://api/", { headers: { "Authorization": "Basic something" } });
    await expect(requireAdmin(badHeader, config)).rejects.toMatchObject({ status: 401 });
    
    const wrongToken = new Request("https://api/", { headers: { "Authorization": "Bearer not-the-secret" } });
    await expect(requireAdmin(wrongToken, config)).rejects.toMatchObject({ status: 401 });
  });

  it("signs and verifies JWT tokens containing Unicode / Sinhala characters without error", async () => {
    const { signJwt, verifyJwt } = await import("../src/shared/jwt");
    const unicodePayload = { sub: "admin-1", username: "admin", name: "පාලක පරිශීලක", email: "admin@mehewara.edu.lk", role: "admin" };
    const token = await signJwt(unicodePayload, "secret-admin", 60 * 1000);
    expect(typeof token).toBe("string");
    const decoded = await verifyJwt<typeof unicodePayload>(token, "secret-admin");
    expect(decoded?.name).toBe("පාලක පරිශීලක");
    expect(decoded?.sub).toBe("admin-1");
  });
});


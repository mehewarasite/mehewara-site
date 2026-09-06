import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorResponse, HttpError } from "../src/shared/errors";
import { parseJson, requireMethod } from "../src/shared/validation";

describe("validation and structured errors", () => {
  it("rejects wrong methods and malformed JSON with bounded error responses", async () => {
    expect(() => requireMethod(new Request("https://api.test", { method: "GET" }), "POST")).toThrow(HttpError);
    const response = await (async () => {
      try { await parseJson(new Request("https://api.test", { method: "POST", body: "nope", headers: { "Content-Type": "application/json" } }), z.object({ value: z.string() }).strict()); return null; }
      catch (error) { return errorResponse(error, "request-1"); }
    })();
    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({ error: { code: "BAD_REQUEST", message: "Malformed JSON body", requestId: "request-1" } });
  });

  it("does not leak unexpected exception details", async () => {
    const body = await errorResponse(new Error("secret binding detail"), "request-2").json();
    expect(body).toEqual({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", requestId: "request-2" } });
  });
});

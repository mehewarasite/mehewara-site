import { requireMethod, parseBody, parseJson } from "../../shared/validation";
import type { AdminDeps } from "./route";
import { z } from "zod";

export async function budgetStatusRoute(request: Request, deps: AdminDeps): Promise<Response> {
  requireMethod(request, "GET");
  const status = await deps.context.gate.status();
  return Response.json(status);
}

const EmergencyCommand = z.object({ reason: z.string(), durationMs: z.number() });
type EmergencyCommand = z.infer<typeof EmergencyCommand>;

export async function budgetEmergencyRoute(request: Request, deps: AdminDeps): Promise<Response> {
  requireMethod(request, "POST");
  const body = await parseBody<EmergencyCommand>(request, deps.context.requestId, () => parseJson(request, EmergencyCommand));
  if (!body.ok) return body.response;
  
  if (!deps.principal) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await deps.context.gate.activateEmergency({
    actorId: deps.principal.subject,
    reason: body.value.reason,
    expiresAt: Date.now() + body.value.durationMs,
    auditId: deps.context.requestId
  });
  return Response.json({ ok: true });
}

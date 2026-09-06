/**
 * Publication fetch. One GET against /api/v1/publication/current; the edge
 * caches the alias for 60s and the worker serves conditional 304s, so
 * polling is cheap. Retries are caller-driven (Retry button), never loops.
 */

export function apiBaseUrl() {
  const meta = document.querySelector('meta[name="api-base-url"]');
  const base = (meta?.getAttribute("content") ?? "").replace(/\/+$/, "");
  if (base) return base;
  return "https://mehewara-v2-api-production.mehewara-site.workers.dev";
}

export async function fetchCurrent(signal) {
  const res = await fetch(`${apiBaseUrl()}/api/v1/publication/current`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message ? `: ${body.error.message}` : "";
    } catch { /* keep status-only */ }
    throw new Error(`Publication request failed (${res.status})${detail}`);
  }
  return res.json();
}

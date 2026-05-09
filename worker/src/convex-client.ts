// Tiny Convex HTTP client. We don't pull in `convex/browser` because it
// drags React types and we only need to POST to a couple of HTTP actions.
// Convex deployments expose every `httpAction` route at `${CONVEX_URL}/...`.

export class ConvexClient {
  constructor(private baseUrl: string) {}

  // Some Convex routes return JSON (e.g. /persona/tune-window via
  // `Response.json(window)`) and others return the literal text "ok"
  // (acknowledgement-only routes). Parse defensively so the post-call
  // pipeline doesn't blow up on the latter — calling .json() on "ok"
  // throws, which used to kill extraction before it ever started.
  async post<T = unknown>(path: string, body: unknown): Promise<T | null> {
    const res = await fetch(this.baseUrl.replace(/\/+$/, "") + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`convex POST ${path} failed: ${res.status} ${text}`);
    }
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }
}

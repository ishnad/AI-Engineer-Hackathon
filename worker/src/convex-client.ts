// Tiny Convex HTTP client. We don't pull in `convex/browser` because it
// drags React types and we only need to POST to a couple of HTTP actions.
// Convex deployments expose every `httpAction` route at `${CONVEX_URL}/...`.

export class ConvexClient {
  constructor(private baseUrl: string) {}

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.baseUrl.replace(/\/+$/, "") + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`convex POST ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }
}

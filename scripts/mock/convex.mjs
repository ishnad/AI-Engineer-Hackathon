// Fake Convex HTTP server.
//
// 200s every /ring0/* POST and logs the route + payload preview, so the
// post-call pipeline has a real endpoint to hit during local regression checks.
// Point the Worker at it via:  CONVEX_URL=http://127.0.0.1:8187

import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_CONVEX_PORT ?? 8187);
const KNOWN = new Set([
  "/ring0/call/started",
  "/ring0/call/ended",
  "/ring0/signature",
  "/ring0/poster",
  "/ring0/proposed-persona",
  "/ring0/pipeline-stats",
  "/ring0/persona/tune-window",
]);

function bodyFor(path) {
  if (path === "/ring0/persona/tune-window") return null;
  return { ok: true };
}

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();

  if (req.method === "POST" && req.url && KNOWN.has(req.url)) {
    let preview = raw;
    try { preview = JSON.stringify(JSON.parse(raw)).slice(0, 200); } catch {}
    console.log(`[mock-convex] ${req.url} ← ${preview}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(bodyFor(req.url)));
    return;
  }

  console.warn(`[mock-convex] 404 ${req.method} ${req.url}`);
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found", url: req.url }));
});

server.listen(PORT, () => {
  console.log(`[mock-convex] listening on http://127.0.0.1:${PORT}`);
});

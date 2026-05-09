// Fake OpenAI HTTP server.
//
// Routes the two endpoints pipeline/src/openai.ts hits:
//   POST /v1/responses           → canned tool-call sequence ending in submit_signature
//   POST /v1/images/generations  → static placeholder image URL
//
// Point the Worker at it via:  OPENAI_BASE_URL=http://127.0.0.1:8766

import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_OPENAI_PORT ?? 8766);

// Per-conversation step counter so the model "thinks" once before submitting,
// exercising the tool-call loop in extract.ts. Keyed by best-effort transcript
// hash so concurrent calls don't collide.
const stepByConvo = new Map();

function convoKey(input) {
  const userMsg = (input ?? []).find((m) => m.role === "user")?.content ?? "";
  return String(userMsg).slice(0, 64);
}

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};

  if (req.method === "POST" && req.url === "/v1/responses") {
    const key = convoKey(body.input);
    const step = stepByConvo.get(key) ?? 0;
    stepByConvo.set(key, step + 1);

    if (step === 0) {
      // First turn: the agent searches prior signatures (so the test loop
      // covers both the tool-result roundtrip and the terminal call).
      return json(res, {
        output: [{
          type: "function_call",
          call_id: "c1",
          name: "search_prior_signatures",
          arguments: JSON.stringify({ query: "irs gift card" }),
        }],
      });
    }

    // Second turn: terminal submit_signature.
    return json(res, {
      output: [{
        type: "function_call",
        call_id: "c2",
        name: "submit_signature",
        arguments: JSON.stringify({
          scamCategory: "irs-impersonation",
          claimedOrg: "Internal Revenue Service",
          tactics: ["authority", "urgency", "fear", "gift-card-payment"],
          targetDemographic: "elderly",
          dangerScore: 8,
          summary: "Caller impersonated the IRS and demanded payment in gift cards.",
        }),
      }],
    });
  }

  if (req.method === "POST" && req.url === "/v1/images/generations") {
    return json(res, {
      data: [{
        url: "https://images.unsplash.com/photo-1542856204-00101eb6def4?w=600&fit=crop&q=80",
      }],
    });
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found", url: req.url }));
});

function json(res, body) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

server.listen(PORT, () => {
  console.log(`[mock-openai] listening on http://127.0.0.1:${PORT}`);
});

// Block 6: GPT-5.5 agentic extraction.
//
// The agent loop — not the JSON shape — is the demo for "Best use of GPT-5.5".
// We give the model three tools:
//   • search_prior_signatures → semantic dedupe against past Ring0 calls
//   • lookup_known_scams      → known-scam knowledge base / FTC corpus
//   • submit_signature        → terminal tool that writes the structured result
// Then we let it loop until it calls submit_signature.

import { createOpenAI } from "./openai";
import type { OpenAIOptions, PostCallJob, ScamSignature } from "./types";

const SYSTEM = `
You are a scam-call analyst. You will be given the full transcript of a phone
call between an automated Ring0 persona and a likely scam caller.

Your job is to identify what the *scammer* was trying to achieve and produce a
structured "scam signature" that captures it.

Use the available tools liberally. Before finalizing, ALWAYS call
search_prior_signatures at least once to check whether this matches a known
Ring0 cluster. If you find a similar prior signature, reuse its category and
hash so we cluster instead of fragmenting.

When you are confident, call submit_signature — that is the only way to
return your result. Always include 2–3 short, concrete proposedActions for
the user. Ring0 operates in Singapore — recommend Singapore-based reporting
channels only. Examples: "Block this number on your phone", "Report via the
ScamShield app", "Call the Anti-Scam Helpline 1800-722-6688", "File a report
at scamalert.sg", "Warn family members about this script". Do NOT recommend
US/FTC/IC3 channels. Keep each action under 80 characters and do not invent
phone numbers, addresses, or codes beyond the verified Singapore ones above.
`.trim();

const TOOLS = [
  {
    type: "function",
    name: "search_prior_signatures",
    description: "Semantic search across Ring0's existing signature corpus.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "lookup_known_scams",
    description: "Look up an external scam category by name (FTC/IC3 corpus).",
    parameters: {
      type: "object",
      properties: { category: { type: "string" } },
      required: ["category"],
    },
  },
  {
    type: "function",
    name: "submit_signature",
    description: "Terminal tool. Submit the final structured scam signature.",
    parameters: {
      type: "object",
      properties: {
        scamCategory: { type: "string" },
        claimedOrg: { type: ["string", "null"] },
        tactics: { type: "array", items: { type: "string" } },
        targetDemographic: { type: ["string", "null"] },
        dangerScore: { type: "number", minimum: 0, maximum: 10 },
        summary: { type: "string" },
        proposedActions: { type: "array", items: { type: "string" } },
      },
      required: ["scamCategory", "tactics", "dangerScore", "summary", "proposedActions"],
    },
  },
];

export async function extractSignature(
  job: PostCallJob,
  opts: OpenAIOptions,
): Promise<ScamSignature> {
  const openai = createOpenAI(opts.apiKey, opts.baseUrl);

  const transcript = job.transcript
    .map((t) => `${t.role === "agent" ? "RING0" : "CALLER"}: ${t.text}`)
    .join("\n");

  const input: any[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Call transcript:\n\n${transcript}` },
  ];

  // Bounded agent loop — we give the model up to 6 tool turns before bailing.
  for (let step = 0; step < 6; step++) {
    const res = await openai.responsesCreate({
      model: opts.model,
      input,
      tools: TOOLS,
      tool_choice: "auto",
    });

    const calls = collectToolCalls(res);
    if (calls.length === 0) break;

    for (const call of calls) {
      input.push({ type: "function_call", call_id: call.id, name: call.name, arguments: call.arguments });
      if (call.name === "submit_signature") {
        const args = safeParse(call.arguments);
        return finalizeSignature(args);
      }
      const output = await runTool(call.name, safeParse(call.arguments));
      input.push({ type: "function_call_output", call_id: call.id, output: JSON.stringify(output) });
    }
  }

  // Fallback if the model never called submit_signature.
  return finalizeSignature({
    scamCategory: "unclassified",
    claimedOrg: null,
    tactics: [],
    targetDemographic: null,
    dangerScore: 0,
    summary: "Agent did not finalize a signature.",
    proposedActions: [],
  });
}

function collectToolCalls(res: any): { id: string; name: string; arguments: string }[] {
  // The Responses API surfaces tool calls under `output[*].type === "function_call"`.
  const out = (res?.output ?? []) as any[];
  return out
    .filter((o) => o.type === "function_call")
    .map((o) => ({ id: o.call_id ?? o.id, name: o.name, arguments: o.arguments ?? "{}" }));
}

function safeParse(raw: string | undefined): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function runTool(name: string, args: any): Promise<unknown> {
  switch (name) {
    case "search_prior_signatures":
      // TODO: hit Vectorize via the Worker. For now return empty so the
      // agent treats every signature as new.
      return { results: [] as { signatureHash: string; category: string; similarity: number }[] };
    case "lookup_known_scams":
      return { matches: [{ category: args?.category ?? "unknown", source: "ftc" }] };
    default:
      return { error: `unknown tool ${name}` };
  }
}

function finalizeSignature(args: Partial<ScamSignature>): ScamSignature {
  const tactics = (args.tactics ?? []).slice().sort();
  const seed = `${args.scamCategory ?? ""}|${args.claimedOrg ?? ""}|${tactics.join(",")}`;
  return {
    signatureHash: hashString(seed),
    scamCategory: args.scamCategory ?? "unclassified",
    claimedOrg: args.claimedOrg ?? null,
    tactics,
    targetDemographic: args.targetDemographic ?? null,
    dangerScore: clamp(Number(args.dangerScore ?? 0), 0, 10),
    summary: args.summary ?? "",
    proposedActions: (args.proposedActions ?? []).slice(0, 3),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, isFinite(n) ? n : 0));
}

// Stable, lightweight hash. Good enough for clustering keys; not crypto.
function hashString(s: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(13, "0");
}

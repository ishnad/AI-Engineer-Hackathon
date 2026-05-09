// Meta-agent. Originally Cursor SDK + GitHub PR; now GPT-5.5 authors a persona
// definition and we hand it to Convex for the dashboard to display. No GitHub,
// no Cursor SDK — review and merging are out of scope.
//
// Demo moment: a fresh scam cluster lands → a "proposed persona" appears in
// the dashboard, body authored by GPT-5.5, ready for a maintainer to copy
// into personas/src/<slug>.ts manually.

import { createOpenAI, responseText } from "./openai";
import type { OpenAIOptions, ScamSignature } from "./types";

export interface ProposedPersona {
  slug: string;
  scamCategory: string;
  signatureHash: string;
  systemPrompt: string;
  rationale: string;
}

export interface PersonaAuthorPrompt {
  slug: string;
  systemInstructions: string;
  userPrompt: string;
}

export interface MetaAgentOptions extends OpenAIOptions {
  // When true, log the persona-author prompt and skip the OpenAI round-trip.
  dryRun?: boolean;
}

export function buildPersonaAuthorPrompt(signature: ScamSignature): PersonaAuthorPrompt {
  const slug = slugify(signature.scamCategory);
  const systemInstructions = [
    "You are a Ring0 maintainer authoring a new persona for a freshly-detected scam cluster.",
    "Output JSON only, with exactly two string fields: `systemPrompt` and `rationale`.",
    "The systemPrompt must:",
    "  • be the full system prompt for the new persona (a multi-paragraph string)",
    "  • embed the verbatim text 'STALLING_TOOLKIT' and 'HARD_GUARDRAILS' as section markers",
    "  • never instruct the persona to read out numbers, addresses, codes, or OTPs",
    "  • adopt a distinctive voice tuned to keep this kind of caller on the line",
    "The rationale is a 1–2 sentence explanation of why this persona will outperform a generic one against this cluster.",
    "No prose outside the JSON. No markdown fences.",
  ].join("\n");

  const userPrompt = [
    `Cluster summary:`,
    `  • category: ${signature.scamCategory}`,
    `  • impersonating: ${signature.claimedOrg ?? "unknown"}`,
    `  • tactics: ${signature.tactics.join(", ") || "n/a"}`,
    `  • target demographic: ${signature.targetDemographic ?? "n/a"}`,
    `  • danger score: ${signature.dangerScore}/10`,
    `  • summary: ${signature.summary}`,
    ``,
    `Proposed file slug: personas/src/${slug}.ts`,
    `Author the persona.`,
  ].join("\n");

  return { slug, systemInstructions, userPrompt };
}

export async function proposePersona(
  signature: ScamSignature,
  opts: MetaAgentOptions,
): Promise<ProposedPersona | null> {
  const { slug, systemInstructions, userPrompt } = buildPersonaAuthorPrompt(signature);

  if (opts.dryRun) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        step: "metaAgent.dryrun",
        slug,
        signatureHash: signature.signatureHash,
        scamCategory: signature.scamCategory,
        systemInstructions,
        userPrompt,
      }),
    );
    return {
      slug,
      scamCategory: signature.scamCategory,
      signatureHash: signature.signatureHash,
      systemPrompt: "[dry-run]",
      rationale: "[dry-run]",
    };
  }

  const openai = createOpenAI(opts.apiKey, opts.baseUrl);
  const res = await openai.responsesCreate({
    model: opts.model,
    input: [
      { role: "system", content: systemInstructions },
      { role: "user", content: userPrompt },
    ],
  });

  const text = responseText(res).trim();
  if (!text) throw new Error("meta-agent: empty response from openai");
  const parsed = safeJson(text);
  const systemPrompt = typeof parsed.systemPrompt === "string" ? parsed.systemPrompt : "";
  const rationale = typeof parsed.rationale === "string" ? parsed.rationale : "";
  if (!systemPrompt) throw new Error("meta-agent: response missing systemPrompt");

  return {
    slug,
    scamCategory: signature.scamCategory,
    signatureHash: signature.signatureHash,
    systemPrompt,
    rationale,
  };
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    // Tolerate models that wrap JSON in fences despite instructions.
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return {};
      }
    }
    return {};
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "unknown"
  );
}

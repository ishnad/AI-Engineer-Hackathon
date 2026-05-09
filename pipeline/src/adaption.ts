// Persona-tuning loop. Originally Adaption Labs; now GPT-5.5.
//
// After every N calls a persona has handled, we ask GPT-5.5 to read the
// current system prompt + recent call metrics and propose a refined prompt
// that should keep callers on the line longer without violating guardrails.
// We bump the persona version, write the new prompt + version into Convex,
// and the dashboard renders the learning curve from there.

import { createOpenAI, responseText } from "./openai";
import type { OpenAIOptions, PostCallJob } from "./types";

const TUNE_EVERY_N_CALLS = 5;

export interface PersonaTuningOptions extends OpenAIOptions {
  convex: { post(path: string, body: unknown): Promise<unknown> };
}

interface TuneWindow {
  personaId: string;
  version: number;
  systemPrompt: string;
  avgDurationSec: number;
  callsHandled: number;
  recentCalls: { durationSec: number; hangupReason: string; tactics: string[] }[];
}

export async function tunePersona(
  job: PostCallJob,
  opts: PersonaTuningOptions,
): Promise<void> {
  const personaId = job.personaId;
  if (!personaId) return;

  const due = (await opts.convex.post("/ring0/persona/tune-window", {
    personaId,
    every: TUNE_EVERY_N_CALLS,
  })) as TuneWindow | null;
  if (!due) return;

  const refined = await callOpenAITuner(due, opts);

  await opts.convex.post("/ring0/persona/refined", {
    personaId,
    version: due.version + 1,
    systemPrompt: refined.systemPrompt,
    avgDurationSec: due.avgDurationSec,
    callsHandled: due.callsHandled,
  });
}

async function callOpenAITuner(
  window: TuneWindow,
  opts: OpenAIOptions,
): Promise<{ systemPrompt: string }> {
  const openai = createOpenAI(opts.apiKey, opts.baseUrl);

  const observations = window.recentCalls
    .map(
      (c, i) =>
        `  call ${i + 1}: ${c.durationSec}s, ended via "${c.hangupReason}", tactics seen: ${c.tactics.join(", ") || "n/a"}`,
    )
    .join("\n");

  const res = await openai.responsesCreate({
    model: opts.model,
    input: [
      {
        role: "system",
        content:
          "You tune Ring0 persona prompts. Goal: maximize the duration the caller " +
          "stays on the line. Hard constraints (NEVER violate): never read out " +
          "numbers, addresses, codes, or OTPs; preserve the existing stalling " +
          "toolkit; preserve the persona's voice. Output ONLY the new system " +
          "prompt — no preamble, no commentary, no markdown fences.",
      },
      {
        role: "user",
        content:
          `Persona: ${window.personaId} (v${window.version})\n` +
          `Avg call duration so far: ${Math.round(window.avgDurationSec)}s over ${window.callsHandled} calls.\n\n` +
          `Recent calls:\n${observations}\n\n` +
          `Current system prompt:\n---\n${window.systemPrompt}\n---\n\n` +
          `Return a refined system prompt.`,
      },
    ],
  });

  const text = responseText(res).trim();
  if (!text) throw new Error("tuner: empty response from openai");
  return { systemPrompt: text };
}

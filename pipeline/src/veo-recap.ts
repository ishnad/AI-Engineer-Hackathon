// Weekly recap. Originally Veo 3 video; now GPT-5.5 markdown + GPT Image 2 hero
// poster. Triggered by a Convex cron (see dashboard/convex/crons.ts), not the
// per-call queue. Returns markdown + posterUrl — write both to liveStats so the
// dashboard renders a text-and-image recap.

import { createOpenAI, responseText } from "./openai";
import type { OpenAIOptions } from "./types";

export interface WeeklyRecapInput {
  totalCalls: number;
  totalScammerMinutes: number;
  topCategories: { category: string; count: number }[];
  topTactics: { tactic: string; count: number }[];
}

export interface WeeklyRecap {
  markdown: string;
  posterUrl: string;
}

export async function generateWeeklyRecap(
  input: WeeklyRecapInput,
  opts: OpenAIOptions & { imageModel?: string },
): Promise<WeeklyRecap> {
  const openai = createOpenAI(opts.apiKey, opts.baseUrl);

  const stats = [
    `${input.totalCalls.toLocaleString()} scam calls intercepted`,
    `${Math.round(input.totalScammerMinutes).toLocaleString()} scammer-minutes wasted`,
    `top categories: ${input.topCategories.map((c) => c.category).slice(0, 3).join(", ") || "n/a"}`,
    `most common tactics: ${input.topTactics.map((t) => t.tactic).slice(0, 3).join(", ") || "n/a"}`,
  ].join("\n");

  const textRes = await openai.responsesCreate({
    model: opts.model,
    input: [
      {
        role: "system",
        content:
          "You write punchy weekly recaps for Ring0, an AI scam-call interceptor. " +
          "Output markdown only. 80–120 words. Include one bold opening hook, then " +
          "a short bulleted breakdown of the stats, then a one-sentence sign-off. " +
          "Tagline: \"We don't block scammers. We answer them.\" No PII.",
      },
      { role: "user", content: `This week:\n${stats}` },
    ],
  });
  const markdown = responseText(textRes).trim();
  if (!markdown) throw new Error("recap: empty response from openai");

  const topCategory = input.topCategories[0]?.category ?? "mixed";
  const imageRes = await openai.imagesGenerate({
    model: opts.imageModel ?? "gpt-image-2",
    prompt:
      `Stylized "Ring0 — Week in Review" hero poster. Dominant scam category: ` +
      `${topCategory}. Bold typography reading "THIS WEEK", retro propaganda ` +
      `aesthetic, warm noir + neon highlights, 35mm grain. No real faces, no PII.`,
    size: "1024x1024",
    n: 1,
  });
  const first = imageRes.data[0];
  const posterUrl = first?.url ?? (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : "");
  if (!posterUrl) throw new Error("recap: no image url from openai");

  return { markdown, posterUrl };
}

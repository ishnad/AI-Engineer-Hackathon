// Block 7: GPT Image 2 "Most Wanted" poster generation.
//
// Each scam category gets a distinct visual treatment so the dashboard gallery
// reads at a glance. Returns a public URL the dashboard can <img src=...>.

import { createOpenAI } from "./openai";
import type { OpenAIOptions, ScamSignature } from "./types";

const STYLE_BY_CATEGORY: Record<string, string> = {
  "tech-support": "1940s noir crime poster, blue typewriter type, blocky red WANTED banner",
  "irs-impersonation": "vintage US treasury propaganda, eagle silhouette, distressed paper",
  "romance": "torn vintage valentine, faded watercolor, smudged ink heart",
  "package-delivery": "cardboard texture, smudged shipping label, red INTERCEPTED stamp",
  "investment-fraud": "1920s stock-ticker print, bold serif, gold-leaf accents",
  "default": "vintage Wild West WANTED poster, sepia, distressed kraft paper, hand-set type",
};

export async function generatePoster(
  signature: ScamSignature,
  opts: OpenAIOptions,
): Promise<string> {
  const openai = createOpenAI(opts.apiKey, opts.baseUrl);
  const style = STYLE_BY_CATEGORY[signature.scamCategory] ?? STYLE_BY_CATEGORY.default;

  const prompt = [
    `WANTED poster for a phone scammer.`,
    `Scam category: ${signature.scamCategory}.`,
    signature.claimedOrg ? `Impersonating: ${signature.claimedOrg}.` : "",
    `Tactics in caption: ${signature.tactics.slice(0, 3).join(", ") || "various"}.`,
    `Visual style: ${style}.`,
    `Headline reads "MOST WANTED". Subheadline reads "Ring0 #${signature.signatureHash.slice(0, 6)}".`,
    `No real faces. No real names. Use a stylized silhouette where a face would go.`,
  ]
    .filter(Boolean)
    .join(" ");

  const res = await openai.imagesGenerate({
    model: opts.model,
    prompt,
    size: "1024x1536",
    n: 1,
  });

  const first = res.data[0];
  if (!first) throw new Error("no image returned from openai");
  if (first.url) return first.url;
  if (first.b64_json) return `data:image/png;base64,${first.b64_json}`;
  throw new Error("openai returned image with neither url nor b64_json");
}

// Drains the ring0-post-call queue. For each finished call we:
//   1. tell Convex the call has ended (so the dashboard goes "spinner")
//   2. run the GPT-5.5 extraction agent to get a scam signature
//   3. embed the signature into Vectorize for clustering
//   4. fan out: GPT Image 2 poster, GPT-5.5 meta-agent (proposed persona),
//      GPT-5.5 persona tuner — all in parallel
//   5. write the resolved fields back to Convex
//
// We catch per-step errors and keep going — a missing poster shouldn't kill
// the signature or the scammer-minutes counter.

import {
  generatePoster,
  extractSignature,
  proposePersona,
  tunePersona,
} from "@ring0/pipeline";
import type { PostCallJob, ScamSignature } from "@ring0/pipeline";
import { ConvexClient } from "./convex-client";
import type { Env } from "./index";
import { logError, logInfo } from "./logger";
import { sendTelegramSummary } from "./telegram";

export async function handlePostCallBatch(
  batch: MessageBatch<PostCallJob>,
  env: Env,
): Promise<void> {
  const convex = new ConvexClient(env.CONVEX_URL);

  for (const msg of batch.messages) {
    const t0 = Date.now();
    try {
      await handleOne(msg.body, env, convex);
      const totalMs = Date.now() - t0;
      msg.ack();
      logInfo({ callSid: msg.body.callSid, step: "postCall.ok", totalMs });
      // Fire-and-forget: surface latency into the dashboard tile.
      convex
        .post("/ring0/pipeline-stats", { callSid: msg.body.callSid, totalMs })
        .catch((err) => logError({ callSid: msg.body.callSid, step: "pipelineStats.err" }, err));
    } catch (err) {
      logError({ callSid: msg.body.callSid, step: "postCall.failed", totalMs: Date.now() - t0 }, err);
      msg.retry();
    }
  }
}

async function handleOne(job: PostCallJob, env: Env, convex: ConvexClient): Promise<void> {
  const callSid = job.callSid;
  const t0 = Date.now();
  let last = t0;
  const stage = (step: string) => {
    const now = Date.now();
    logInfo({ callSid, step, stepMs: now - last, totalMs: now - t0 });
    last = now;
  };

  await convex.post("/ring0/call/ended", {
    callSid,
    durationSec: job.durationSec,
    transcript: job.transcript,
  });
  stage("convex.callEnded");

  const openaiOpts = {
    apiKey: env.OPENAI_API_KEY,
    model: "gpt-5.5",
    baseUrl: env.OPENAI_BASE_URL,
  };

  const signature = await extractSignature(job, openaiOpts);
  stage("extract.ok");

  await Promise.allSettled([
    embedSignature(env, signature),
    convex.post("/ring0/signature", { callSid, signature }),
    sendTelegramSummary(env, job, signature).catch((err) =>
      logError({ callSid, step: "telegram.err" }, err),
    ),
  ]);
  stage("signature.embedded");

  const posterRes = await Promise.allSettled([
    generatePoster(signature, { ...openaiOpts, model: "gpt-image-2" }).then((url) =>
      convex.post("/ring0/poster", { callSid, posterImageUrl: url }),
    ),
  ]);
  if (posterRes[0]?.status === "rejected")
    logError({ callSid, step: "poster.err" }, posterRes[0].reason);
  stage("media.fanout");

  // Fire-and-forget: these are about future calls, not this one.
  Promise.allSettled([
    tunePersona(job, { ...openaiOpts, convex }),
    proposePersonaIfNew(signature, openaiOpts, env, convex),
  ]).catch(() => {});
}

async function proposePersonaIfNew(
  signature: ScamSignature,
  openaiOpts: { apiKey: string; model: string; baseUrl?: string },
  env: Env,
  convex: ConvexClient,
): Promise<void> {
  const proposed = await proposePersona(signature, {
    ...openaiOpts,
    dryRun: env.RING0_META_DRYRUN === "1",
  });
  if (!proposed) return;
  await convex.post("/ring0/proposed-persona", proposed);
}

async function embedSignature(env: Env, signature: { signatureHash: string; scamCategory: string; tactics: string[] }): Promise<void> {
  // Cheap embedding — concatenate the structured fields and hash-fold to a
  // 768-dim vector. Replace with Workers AI `@cf/baai/bge-base-en-v1.5`
  // (or OpenAI text-embedding-3) once we wire credentials.
  const text = [signature.scamCategory, ...signature.tactics].join(" | ");
  const dim = 768;
  const vec = new Float32Array(dim);
  for (let i = 0; i < text.length; i++) {
    vec[i % dim]! += text.charCodeAt(i) / 255;
  }
  await env.SIGNATURES.upsert([
    {
      id: signature.signatureHash,
      values: Array.from(vec),
      metadata: { category: signature.scamCategory },
    },
  ]);
}

// HTTP routes the Cloudflare Worker calls into.
//
// Each route is a thin wrapper around a mutation/query so the Worker doesn't
// need a Convex client SDK — it just POSTs JSON.

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/ring0/call/started",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = (await request.json()) as {
      callSid: string;
      personaId: string;
      startedAt: number;
    };
    await ctx.runMutation(api.calls.setStarted, body);
    return new Response("ok");
  }),
});

http.route({
  path: "/ring0/call/ended",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = (await request.json()) as {
      callSid: string;
      durationSec: number;
      transcript: { role: "user" | "agent"; text: string; t: number }[];
    };
    await ctx.runMutation(api.calls.setEnded, {
      callSid: body.callSid,
      durationSec: body.durationSec,
      transcript: JSON.stringify(body.transcript),
    });
    return new Response("ok");
  }),
});

http.route({
  path: "/ring0/signature",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = (await request.json()) as {
      callSid: string;
      signature: {
        signatureHash: string;
        scamCategory: string;
        claimedOrg: string | null;
        tactics: string[];
        dangerScore: number;
      };
    };
    await ctx.runMutation(api.calls.setSignature, {
      callSid: body.callSid,
      scamCategory: body.signature.scamCategory,
      dangerScore: body.signature.dangerScore,
      signatureHash: body.signature.signatureHash,
    });
    await ctx.runMutation(api.signatures.upsert, {
      signatureHash: body.signature.signatureHash,
      claimedOrg: body.signature.claimedOrg ?? undefined,
      tactics: body.signature.tactics,
    });
    return new Response("ok");
  }),
});

http.route({
  path: "/ring0/poster",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = (await request.json()) as { callSid: string; posterImageUrl: string };
    await ctx.runMutation(api.calls.setPoster, body);
    return new Response("ok");
  }),
});

http.route({
  path: "/ring0/proposed-persona",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = (await request.json()) as {
      slug: string;
      scamCategory: string;
      signatureHash: string;
      systemPrompt: string;
      rationale: string;
    };
    await ctx.runMutation(api.proposedPersonas.upsert, body);
    return new Response("ok");
  }),
});

http.route({
  path: "/ring0/pipeline-stats",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = (await request.json()) as { callSid: string; totalMs: number };
    await ctx.runMutation(api.liveStats.recordPipeline, { totalMs: body.totalMs });
    return new Response("ok");
  }),
});

http.route({
  path: "/ring0/persona/tune-window",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = (await request.json()) as { personaId: string; every: number };
    const window = await ctx.runQuery(api.personas.tuneWindow, body);
    return Response.json(window);
  }),
});

http.route({
  path: "/ring0/persona/refined",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = (await request.json()) as {
      personaId: string;
      version: number;
      systemPrompt: string;
      avgDurationSec: number;
      callsHandled: number;
    };
    await ctx.runMutation(api.personas.refined, body);
    return new Response("ok");
  }),
});

export default http;

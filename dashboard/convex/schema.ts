// Convex schema mirrors §10 of docs/PRD.md.
// Block 5: scaffold, then have the Worker write into `calls` on hangup.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  calls: defineTable({
    callSid: v.string(),
    personaId: v.string(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    durationSec: v.optional(v.number()),
    transcript: v.optional(v.string()),
    scamCategory: v.optional(v.string()),
    dangerScore: v.optional(v.number()),
    signatureHash: v.optional(v.string()),
    signatureVectorId: v.optional(v.string()),
    posterImageUrl: v.optional(v.string()),
  }).index("by_callSid", ["callSid"]),

  personas: defineTable({
    personaId: v.string(),
    name: v.string(),
    systemPrompt: v.string(),
    version: v.number(),
    avgDurationSec: v.number(),
    callsHandled: v.number(),
  }).index("by_personaId", ["personaId"]),

  signatures: defineTable({
    signatureHash: v.string(),
    claimedOrg: v.optional(v.string()),
    tactics: v.array(v.string()),
    firstSeen: v.number(),
    lastSeen: v.number(),
    count: v.number(),
  }).index("by_hash", ["signatureHash"]),

  // Meta-agent output: GPT-5.5 authors a persona body when it sees a fresh
  // scam cluster. Surfaced in the dashboard as "Latest proposed personas" —
  // a maintainer copies the body into personas/src/<slug>.ts manually.
  proposedPersonas: defineTable({
    slug: v.string(),
    scamCategory: v.string(),
    signatureHash: v.string(),
    systemPrompt: v.string(),
    rationale: v.string(),
    proposedAt: v.number(),
  }).index("by_slug", ["slug"]),

  liveStats: defineTable({
    totalCalls: v.number(),
    totalScammerMinutes: v.number(),
    weeklyRecapMarkdown: v.optional(v.string()),
    weeklyRecapPosterUrl: v.optional(v.string()),
    // Rolling window of the last N post-call pipeline durations (ms).
    // Dashboard reads this to render the "median post-call ms" tile.
    pipelineMsRecent: v.optional(v.array(v.number())),
  }),
});

import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

export const upsert = internalMutation({
  args: {
    personaId: v.string(),
    name: v.string(),
    systemPrompt: v.string(),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("personas")
      .withIndex("by_personaId", (q) => q.eq("personaId", args.personaId))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, {
        name: args.name,
        systemPrompt: args.systemPrompt,
        version: args.version,
      });
      return row._id;
    }
    return await ctx.db.insert("personas", {
      personaId: args.personaId,
      name: args.name,
      systemPrompt: args.systemPrompt,
      version: args.version,
      avgDurationSec: 0,
      callsHandled: 0,
    });
  },
});

// Adaption Labs hits this. Returns the persona's current state and the most
// recent N calls, or null if it isn't due for a tune yet.
export const tuneWindow = query({
  args: { personaId: v.string(), every: v.number() },
  handler: async (ctx, args) => {
    const persona = await ctx.db
      .query("personas")
      .withIndex("by_personaId", (q) => q.eq("personaId", args.personaId))
      .unique();
    if (!persona) return null;
    const newCallsHandled = persona.callsHandled + 1;
    if (newCallsHandled % args.every !== 0) return null;

    const recentCalls = (await ctx.db.query("calls").order("desc").take(args.every))
      .filter((c) => c.personaId === args.personaId && c.durationSec)
      .map((c) => ({
        durationSec: c.durationSec ?? 0,
        hangupReason: "scammer-hangup", // TODO: capture real reason from CallSession
        tactics: [] as string[],
      }));

    return {
      personaId: persona.personaId,
      version: persona.version,
      systemPrompt: persona.systemPrompt,
      avgDurationSec: persona.avgDurationSec,
      callsHandled: newCallsHandled,
      recentCalls,
    };
  },
});

export const refined = mutation({
  args: {
    personaId: v.string(),
    version: v.number(),
    systemPrompt: v.string(),
    avgDurationSec: v.number(),
    callsHandled: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("personas")
      .withIndex("by_personaId", (q) => q.eq("personaId", args.personaId))
      .unique();
    if (!row) return null;
    await ctx.db.patch(row._id, {
      version: args.version,
      systemPrompt: args.systemPrompt,
      avgDurationSec: args.avgDurationSec,
      callsHandled: args.callsHandled,
    });
    return row._id;
  },
});

export const all = query({
  args: {},
  handler: async (ctx) => ctx.db.query("personas").collect(),
});

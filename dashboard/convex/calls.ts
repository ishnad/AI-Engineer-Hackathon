import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const setStarted = mutation({
  args: {
    callSid: v.string(),
    personaId: v.string(),
    startedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("calls")
      .withIndex("by_callSid", (q) => q.eq("callSid", args.callSid))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("calls", {
      callSid: args.callSid,
      personaId: args.personaId,
      startedAt: args.startedAt,
    });
  },
});

export const setEnded = mutation({
  args: {
    callSid: v.string(),
    durationSec: v.number(),
    transcript: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("calls")
      .withIndex("by_callSid", (q) => q.eq("callSid", args.callSid))
      .unique();
    const id = row
      ? (await ctx.db.patch(row._id, {
          endedAt: Date.now(),
          durationSec: args.durationSec,
          transcript: args.transcript,
        }), row._id)
      : await ctx.db.insert("calls", {
          callSid: args.callSid,
          personaId: "unknown",
          startedAt: Date.now() - args.durationSec * 1000,
          endedAt: Date.now(),
          durationSec: args.durationSec,
          transcript: args.transcript,
        });

    // Roll up into liveStats. There's only ever one row.
    const stats = await ctx.db.query("liveStats").first();
    if (stats) {
      await ctx.db.patch(stats._id, {
        totalCalls: stats.totalCalls + 1,
        totalScammerMinutes: stats.totalScammerMinutes + args.durationSec / 60,
      });
    } else {
      await ctx.db.insert("liveStats", {
        totalCalls: 1,
        totalScammerMinutes: args.durationSec / 60,
      });
    }

    return id;
  },
});

export const setSignature = mutation({
  args: {
    callSid: v.string(),
    scamCategory: v.string(),
    dangerScore: v.number(),
    signatureHash: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("calls")
      .withIndex("by_callSid", (q) => q.eq("callSid", args.callSid))
      .unique();
    if (!row) return null;
    await ctx.db.patch(row._id, {
      scamCategory: args.scamCategory,
      dangerScore: args.dangerScore,
      signatureHash: args.signatureHash,
    });
    return row._id;
  },
});

export const setPoster = mutation({
  args: { callSid: v.string(), posterImageUrl: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("calls")
      .withIndex("by_callSid", (q) => q.eq("callSid", args.callSid))
      .unique();
    if (!row) return null;
    await ctx.db.patch(row._id, { posterImageUrl: args.posterImageUrl });
    return row._id;
  },
});

// Most-recent N calls for the live ticker.
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 25;
    return await ctx.db.query("calls").order("desc").take(limit);
  },
});

// Calls with a poster, for the Most Wanted gallery.
export const withPoster = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 12;
    const rows = await ctx.db.query("calls").order("desc").take(200);
    return rows.filter((r) => r.posterImageUrl).slice(0, limit);
  },
});

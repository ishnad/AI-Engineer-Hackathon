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

// Streamed mid-call: the worker pushes the running transcript every few
// hundred ms so the dashboard's live-transcript card updates in real time
// instead of only at hangup.
export const appendTranscript = mutation({
  args: {
    callSid: v.string(),
    transcript: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("calls")
      .withIndex("by_callSid", (q) => q.eq("callSid", args.callSid))
      .unique();
    if (!row) return null;
    // Don't clobber a final transcript already written by setEnded.
    if (row.endedAt) return row._id;
    await ctx.db.patch(row._id, { transcript: args.transcript });
    return row._id;
  },
});

export const setSignature = mutation({
  args: {
    callSid: v.string(),
    scamCategory: v.string(),
    dangerScore: v.number(),
    signatureHash: v.string(),
    summary: v.string(),
    proposedActions: v.array(v.string()),
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
      summary: args.summary,
      proposedActions: args.proposedActions,
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

// Drop a single call's record so it disappears from Live transcripts and
// Most Wanted. liveStats counters are intentionally left alone — they're
// lifetime totals, not a sum of currently-stored rows.
export const remove = mutation({
  args: { id: v.id("calls") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return null;
  },
});

// Bulk-clear every call older than `olderThanMs` ago. Returns the count
// removed so the dashboard can show a confirmation toast.
export const removeOlderThan = mutation({
  args: { olderThanMs: v.number() },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.olderThanMs;
    const rows = await ctx.db.query("calls").collect();
    let removed = 0;
    for (const row of rows) {
      if (row.startedAt < cutoff) {
        await ctx.db.delete(row._id);
        removed++;
      }
    }
    return removed;
  },
});

// Single call by Twilio CallSid — used by the per-call transcript page that
// the Telegram message links to.
export const byCallSid = query({
  args: { callSid: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("calls")
      .withIndex("by_callSid", (q) => q.eq("callSid", args.callSid))
      .unique();
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

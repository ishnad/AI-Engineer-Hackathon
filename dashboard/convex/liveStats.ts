import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const PIPELINE_WINDOW = 50;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("liveStats").first();
    return (
      row ?? {
        totalCalls: 0,
        totalScammerMinutes: 0,
        weeklyRecapMarkdown: undefined,
        weeklyRecapPosterUrl: undefined,
        pipelineMsRecent: [],
      }
    );
  },
});

export const setWeeklyRecap = mutation({
  args: {
    weeklyRecapMarkdown: v.string(),
    weeklyRecapPosterUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("liveStats").first();
    if (row) {
      await ctx.db.patch(row._id, {
        weeklyRecapMarkdown: args.weeklyRecapMarkdown,
        weeklyRecapPosterUrl: args.weeklyRecapPosterUrl,
      });
      return row._id;
    }
    return await ctx.db.insert("liveStats", {
      totalCalls: 0,
      totalScammerMinutes: 0,
      weeklyRecapMarkdown: args.weeklyRecapMarkdown,
      weeklyRecapPosterUrl: args.weeklyRecapPosterUrl,
    });
  },
});

export const recordPipeline = mutation({
  args: { totalMs: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("liveStats").first();
    const prev = row?.pipelineMsRecent ?? [];
    const next = [...prev, args.totalMs].slice(-PIPELINE_WINDOW);
    if (row) {
      await ctx.db.patch(row._id, { pipelineMsRecent: next });
      return row._id;
    }
    return await ctx.db.insert("liveStats", {
      totalCalls: 0,
      totalScammerMinutes: 0,
      pipelineMsRecent: next,
    });
  },
});

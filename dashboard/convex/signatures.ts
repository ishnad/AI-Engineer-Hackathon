import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const upsert = mutation({
  args: {
    signatureHash: v.string(),
    claimedOrg: v.optional(v.string()),
    tactics: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("signatures")
      .withIndex("by_hash", (q) => q.eq("signatureHash", args.signatureHash))
      .unique();
    const now = Date.now();
    if (row) {
      await ctx.db.patch(row._id, { lastSeen: now, count: row.count + 1 });
      return row._id;
    }
    return await ctx.db.insert("signatures", {
      signatureHash: args.signatureHash,
      claimedOrg: args.claimedOrg,
      tactics: args.tactics,
      firstSeen: now,
      lastSeen: now,
      count: 1,
    });
  },
});

export const leaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("signatures").collect();
    return rows.sort((a, b) => b.count - a.count).slice(0, args.limit ?? 10);
  },
});

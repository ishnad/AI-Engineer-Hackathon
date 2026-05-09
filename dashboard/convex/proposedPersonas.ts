import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Meta-agent output. Idempotent on slug — repeated proposals for the same
// cluster overwrite (and refresh the timestamp) instead of duplicating.
export const upsert = mutation({
  args: {
    slug: v.string(),
    scamCategory: v.string(),
    signatureHash: v.string(),
    systemPrompt: v.string(),
    rationale: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("proposedPersonas")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    const proposedAt = Date.now();
    if (row) {
      await ctx.db.patch(row._id, {
        scamCategory: args.scamCategory,
        signatureHash: args.signatureHash,
        systemPrompt: args.systemPrompt,
        rationale: args.rationale,
        proposedAt,
      });
      return row._id;
    }
    return await ctx.db.insert("proposedPersonas", { ...args, proposedAt });
  },
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 6;
    const rows = await ctx.db.query("proposedPersonas").collect();
    return rows.sort((a, b) => b.proposedAt - a.proposedAt).slice(0, limit);
  },
});

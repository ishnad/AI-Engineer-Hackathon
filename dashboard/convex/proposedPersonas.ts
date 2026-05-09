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

// Approve a proposed persona — copy it into the live personas table and
// remove it from the proposed list. personaId is set to the slug so future
// upserts on the same cluster will collide with the live row instead of
// re-creating it as a proposal.
export const approve = mutation({
  args: { id: v.id("proposedPersonas") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return null;
    const existing = await ctx.db
      .query("personas")
      .withIndex("by_personaId", (q) => q.eq("personaId", row.slug))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        systemPrompt: row.systemPrompt,
        version: existing.version + 1,
      });
    } else {
      await ctx.db.insert("personas", {
        personaId: row.slug,
        name: row.slug,
        systemPrompt: row.systemPrompt,
        version: 1,
        avgDurationSec: 0,
        callsHandled: 0,
      });
    }
    await ctx.db.delete(args.id);
    return row.slug;
  },
});

// Deny / dismiss a proposed persona — drops it from the list. The next time
// the meta-agent sees the same cluster it will simply re-propose.
export const deny = mutation({
  args: { id: v.id("proposedPersonas") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return null;
  },
});

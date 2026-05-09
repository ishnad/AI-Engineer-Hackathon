"use node";

// Run with `npx convex run seed:run` after `convex dev`. Seeds the personas
// table from the typed registry in @ring0/personas so we have something to
// adapt against.

import { listPersonas } from "@ring0/personas";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    for (const p of listPersonas()) {
      await ctx.runMutation(internal.personas.upsert, {
        personaId: p.id,
        name: p.name,
        systemPrompt: p.systemPrompt,
        version: p.version,
      });
    }
  },
});

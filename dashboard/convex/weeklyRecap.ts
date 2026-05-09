"use node";

// Weekly recap action. GPT-5.5 markdown + GPT Image 2 hero poster.
// Triggered by the cron in dashboard/convex/crons.ts.

import { generateWeeklyRecap } from "@ring0/pipeline";
import { internalAction } from "./_generated/server";
import { api } from "./_generated/api";

export const renderWeeklyRecap = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("OPENAI_API_KEY not set — skipping weekly recap");
      return;
    }

    const stats = await ctx.runQuery(api.liveStats.get, {});
    const sigs = await ctx.runQuery(api.signatures.leaderboard, { limit: 5 });

    const topCategories = sigs.map((s) => ({
      category: s.claimedOrg ?? "unknown",
      count: s.count,
    }));
    const topTactics = aggregateTactics(sigs);

    const recap = await generateWeeklyRecap(
      {
        totalCalls: stats.totalCalls,
        totalScammerMinutes: stats.totalScammerMinutes,
        topCategories,
        topTactics,
      },
      { apiKey, model: "gpt-5.5", baseUrl: process.env.OPENAI_BASE_URL },
    );

    await ctx.runMutation(api.liveStats.setWeeklyRecap, {
      weeklyRecapMarkdown: recap.markdown,
      weeklyRecapPosterUrl: recap.posterUrl,
    });
  },
});

function aggregateTactics(sigs: { tactics: string[] }[]): { tactic: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of sigs) for (const t of s.tactics) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tactic, count]) => ({ tactic, count }))
    .sort((a, b) => b.count - a.count);
}

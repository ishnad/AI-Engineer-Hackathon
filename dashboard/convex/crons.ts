// Weekly recap cron. Runs every Monday at 09:00 UTC.
// The action queries aggregate stats, asks GPT-5.5 for a markdown summary and
// GPT Image 2 for a hero poster, and writes both onto liveStats.

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.weekly(
  "weekly recap",
  { dayOfWeek: "monday", hourUTC: 9, minuteUTC: 0 },
  internal.weeklyRecap.renderWeeklyRecap,
);

export default crons;

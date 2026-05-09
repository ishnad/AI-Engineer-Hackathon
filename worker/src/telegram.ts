// Outbound Telegram DM with the post-call summary.
//
// Single-user demo: chat_id is a wrangler secret. Failures are non-fatal —
// queue-consumer wraps this in Promise.allSettled so a Telegram outage never
// blocks signature persistence.

import type { PostCallJob, ScamSignature } from "@ring0/pipeline";
import type { Env } from "./index";
import { logError, logInfo } from "./logger";

const API = "https://api.telegram.org";

export async function sendTelegramSummary(
  env: Env,
  job: PostCallJob,
  signature: ScamSignature,
): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    logInfo({ callSid: job.callSid, step: "telegram.skipped", reason: "no token or chat_id" });
    return;
  }

  const text = formatMessage(job, signature, env.DASHBOARD_URL);
  const res = await fetch(`${API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logError({ callSid: job.callSid, step: "telegram.err", status: res.status }, body);
    return;
  }
  logInfo({ callSid: job.callSid, step: "telegram.sent" });
}

function formatMessage(job: PostCallJob, sig: ScamSignature, dashboardUrl?: string): string {
  const verdict = classify(sig);
  const fromLine = job.fromPhone
    ? `*From:* ${escape(job.fromPhone)}`
    : "*From:* _(unknown / withheld)_";
  const actions = sig.proposedActions.length
    ? sig.proposedActions.map((a) => `• ${escape(a)}`).join("\n")
    : "_(none suggested)_";

  const lines = [
    `📞 *Ring0 intercepted a call* (held ${job.durationSec}s)`,
    fromLine,
    "",
    verdict,
    "",
    "*What happened:*",
    escape(sig.summary || "(no summary)"),
    "",
    "*Suggested actions:*",
    actions,
  ];

  if (dashboardUrl) {
    const link = `${dashboardUrl.replace(/\/$/, "")}/calls/${encodeURIComponent(job.callSid)}`;
    lines.push("", `📄 [View full transcript](${link})`);
  }

  return lines.join("\n");
}

// Verdict tiers from the danger score (0–10). The category alone isn't
// enough — a category like "tech-support" with a score of 1.5 means the
// agent had a hunch but no real evidence, so we don't slap "SCAM" on it.
function classify(sig: ScamSignature): string {
  const score = sig.dangerScore;
  const cat = escape(sig.scamCategory);
  if (score >= 7) return `🚨 *Scam* — ${cat} (danger ${score}/10)`;
  if (score >= 4) return `⚠️ *Likely scam* — ${cat} (danger ${score}/10)`;
  if (score >= 1) return `❓ *Inconclusive* — insufficient evidence (danger ${score}/10)`;
  return `✅ *Likely safe* (danger ${score}/10)`;
}

// Telegram Markdown is touchy — escape characters that would break parsing.
function escape(s: string): string {
  return s.replace(/([_*`\[\]])/g, "\\$1");
}

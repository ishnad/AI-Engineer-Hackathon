"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { use } from "react";
import { api } from "../../../convex/_generated/api";

interface Turn {
  role: "user" | "agent";
  text: string;
  t: number;
}

export default function CallDetailPage({
  params,
}: {
  params: Promise<{ callSid: string }>;
}) {
  const { callSid } = use(params);
  const call = useQuery(api.calls.byCallSid, { callSid });

  if (call === undefined) return <Frame><p style={{ opacity: 0.6 }}>Loading…</p></Frame>;
  if (call === null)
    return (
      <Frame>
        <p>No call found with id <code>{callSid}</code>.</p>
        <Link href="/" style={{ color: "#8ab4ff" }}>← Back to dashboard</Link>
      </Frame>
    );

  const verdict = classify(call.dangerScore, call.scamCategory);

  return (
    <Frame>
      <Link href="/" style={{ color: "#8ab4ff", fontSize: "0.85rem" }}>← Back to dashboard</Link>
      <header style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.75rem" }}>Call transcript</h1>
        <p style={{ opacity: 0.65, margin: "0.4rem 0 0", fontSize: "0.9rem" }}>
          {call.personaId} · {call.durationSec ? `${call.durationSec}s` : "—"} · CallSid <code>{call.callSid}</code>
        </p>
      </header>

      <section
        style={{
          padding: "1rem 1.25rem",
          border: "1px solid #222",
          borderRadius: 8,
          marginBottom: "1.5rem",
          background: "#101010",
        }}
      >
        <p style={{ margin: 0, fontSize: "1rem" }}>{verdict}</p>
        {call.summary ? (
          <>
            <h3 style={{ margin: "1rem 0 0.4rem", fontSize: "0.85rem", opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.5 }}>
              What happened
            </h3>
            <p style={{ margin: 0, lineHeight: 1.5 }}>{call.summary}</p>
          </>
        ) : null}
        {call.proposedActions && call.proposedActions.length > 0 ? (
          <>
            <h3 style={{ margin: "1rem 0 0.4rem", fontSize: "0.85rem", opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Suggested actions
            </h3>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", lineHeight: 1.6 }}>
              {call.proposedActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem", opacity: 0.8 }}>Conversation</h2>
      <div style={{ display: "grid", gap: "0.6rem" }}>
        {renderConversation(call.transcript).map((turn, i) => (
          <div
            key={i}
            style={{
              padding: "0.75rem 1rem",
              borderRadius: 8,
              background: turn.role === "agent" ? "#0d1f14" : "#1a1010",
              border: `1px solid ${turn.role === "agent" ? "#1d3a26" : "#3a1d1d"}`,
            }}
          >
            <div style={{ fontSize: "0.7rem", opacity: 0.55, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: "0.25rem" }}>
              {turn.role === "agent" ? "Ring0" : "Caller"}
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{turn.text}</div>
          </div>
        ))}
        {renderConversation(call.transcript).length === 0 ? (
          <p style={{ opacity: 0.5, fontStyle: "italic" }}>(no transcript captured)</p>
        ) : null}
      </div>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ padding: "3rem 2rem", maxWidth: 900, margin: "0 auto", color: "#e8e8e8" }}>
      {children}
    </main>
  );
}

function classify(score: number | undefined, category: string | undefined): string {
  const s = score ?? 0;
  const c = category ?? "unknown";
  if (s >= 7) return `🚨 Scam — ${c} (danger ${s}/10)`;
  if (s >= 4) return `⚠️ Likely scam — ${c} (danger ${s}/10)`;
  if (s >= 1) return `❓ Inconclusive — insufficient evidence (danger ${s}/10)`;
  return `✅ Likely safe (danger ${s}/10)`;
}

function renderConversation(raw: string | undefined): { role: "agent" | "user"; text: string }[] {
  if (!raw) return [];
  try {
    const turns = JSON.parse(raw) as Turn[];
    const groups: { role: Turn["role"]; text: string }[] = [];
    for (const t of turns) {
      const last = groups[groups.length - 1];
      if (last && last.role === t.role) last.text += t.text;
      else groups.push({ role: t.role, text: t.text });
    }
    return groups.map((g) => ({ role: g.role, text: g.text.trim() }));
  } catch {
    return [{ role: "agent", text: raw }];
  }
}

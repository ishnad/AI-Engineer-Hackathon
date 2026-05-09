"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

interface Turn {
  role: "user" | "agent";
  text: string;
  t: number;
}

export function LiveTranscripts() {
  const calls = useQuery(api.calls.recent, { limit: 6 });
  if (!calls) return <Skeleton />;

  return (
    <section style={{ marginTop: "3rem" }}>
      <h2 style={{ marginBottom: "1rem" }}>Live transcripts</h2>
      <div style={{ display: "grid", gap: "1rem" }}>
        {calls.map((c) => (
          <article
            key={c._id}
            style={{ padding: "1rem", border: "1px solid #222", borderRadius: 8 }}
          >
            <header style={{ display: "flex", justifyContent: "space-between", opacity: 0.6, fontSize: "0.85rem" }}>
              <span>{c.personaId} · {c.scamCategory ?? "classifying…"}</span>
              <span>{c.durationSec ? `${c.durationSec}s` : "live"}</span>
            </header>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.85rem",
                margin: "0.5rem 0 0",
                maxHeight: 180,
                overflow: "auto",
              }}
            >
              {renderTurns(c.transcript)}
            </pre>
          </article>
        ))}
      </div>
    </section>
  );
}

function renderTurns(raw: string | undefined): string {
  if (!raw) return "(no transcript yet)";
  try {
    const turns = JSON.parse(raw) as Turn[];
    return turns.map((t) => `${t.role === "agent" ? "RING0" : "CALLER"}: ${t.text}`).join("\n");
  } catch {
    return raw;
  }
}

function Skeleton() {
  return (
    <section style={{ marginTop: "3rem" }}>
      <h2>Live transcripts</h2>
      <p style={{ opacity: 0.6 }}>Loading…</p>
    </section>
  );
}

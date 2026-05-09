"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

interface Turn {
  role: "user" | "agent";
  text: string;
  t: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function LiveTranscripts() {
  const calls = useQuery(api.calls.recent, { limit: 6 });
  const remove = useMutation(api.calls.remove);
  const removeOlder = useMutation(api.calls.removeOlderThan);
  const [removing, setRemoving] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  if (!calls) return <Skeleton />;

  const handleRemove = async (id: Id<"calls">) => {
    setRemoving((m) => ({ ...m, [id]: true }));
    try {
      await remove({ id });
    } finally {
      setRemoving((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
    }
  };

  const handleClearOld = async () => {
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const n = await removeOlder({ olderThanMs: DAY_MS });
      setBulkMsg(n === 0 ? "No transcripts older than 24h." : `Removed ${n} old transcript${n === 1 ? "" : "s"}.`);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <section style={{ marginTop: "3rem" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1rem", gap: "1rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Live transcripts</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {bulkMsg ? <span style={{ opacity: 0.7, fontSize: "0.8rem" }}>{bulkMsg}</span> : null}
          <button
            type="button"
            onClick={handleClearOld}
            disabled={bulkBusy}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: 6,
              border: "1px solid #444",
              background: "#1a1a1a",
              color: "#ddd",
              cursor: bulkBusy ? "not-allowed" : "pointer",
              fontSize: "0.8rem",
            }}
          >
            {bulkBusy ? "Clearing…" : "Clear transcripts older than 24h"}
          </button>
        </div>
      </header>
      <div style={{ display: "grid", gap: "1rem" }}>
        {calls.map((c) => {
          const busy = !!removing[c._id];
          return (
            <article
              key={c._id}
              style={{
                padding: "1rem",
                border: "1px solid #222",
                borderRadius: 8,
                opacity: busy ? 0.5 : 1,
                transition: "opacity 0.2s",
              }}
            >
              <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.6, fontSize: "0.85rem", gap: "1rem" }}>
                <span>{c.personaId} · {c.scamCategory ?? "classifying…"}</span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span>{c.durationSec ? `${c.durationSec}s` : "live"}</span>
                  <button
                    type="button"
                    onClick={() => handleRemove(c._id)}
                    disabled={busy}
                    aria-label="Remove transcript"
                    title="Remove transcript"
                    style={{
                      padding: "0.2rem 0.55rem",
                      borderRadius: 4,
                      border: "1px solid #5a2222",
                      background: "#2a1010",
                      color: "#e9cfcf",
                      cursor: busy ? "not-allowed" : "pointer",
                      fontSize: "0.75rem",
                    }}
                  >
                    {busy ? "Removing…" : "Remove"}
                  </button>
                </span>
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
          );
        })}
      </div>
    </section>
  );
}

function renderTurns(raw: string | undefined): string {
  if (!raw) return "(no transcript yet)";
  try {
    const turns = JSON.parse(raw) as Turn[];
    if (turns.length === 0) return "(no transcript yet)";
    // Gemini Live emits transcription in word-level fragments. Glue
    // consecutive turns from the same speaker into one paragraph so the
    // dashboard shows readable utterances, not one word per line.
    const groups: { role: Turn["role"]; text: string }[] = [];
    for (const t of turns) {
      const last = groups[groups.length - 1];
      if (last && last.role === t.role) {
        last.text += t.text;
      } else {
        groups.push({ role: t.role, text: t.text });
      }
    }
    return groups
      .map((g) => `${g.role === "agent" ? "RING0" : "CALLER"}: ${g.text.trim()}`)
      .join("\n\n");
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

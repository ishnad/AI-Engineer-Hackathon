"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export function ProposedPersonas() {
  const items = useQuery(api.proposedPersonas.recent, { limit: 6 });
  const approve = useMutation(api.proposedPersonas.approve);
  const deny = useMutation(api.proposedPersonas.deny);
  const [pending, setPending] = useState<Record<string, "approve" | "deny" | undefined>>({});

  if (!items || items.length === 0) return null;

  const run = async (id: Id<"proposedPersonas">, action: "approve" | "deny") => {
    setPending((p) => ({ ...p, [id]: action }));
    try {
      if (action === "approve") await approve({ id });
      else await deny({ id });
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  };

  return (
    <section style={{ marginTop: "3rem" }}>
      <h2>Proposed personas (meta-agent)</h2>
      <p style={{ opacity: 0.6, fontSize: "0.9rem", marginTop: 0 }}>
        GPT-5.5 drafts a new persona body whenever a fresh scam cluster appears.
        Approve to add it to the live persona pool, or deny to dismiss.
      </p>
      <div style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        {items.map((p) => {
          const state = pending[p._id];
          const busy = state !== undefined;
          return (
            <article
              key={p._id}
              style={{
                padding: "1rem",
                border: "1px solid #222",
                borderRadius: 8,
                opacity: busy ? 0.6 : 1,
                transition: "opacity 0.2s",
              }}
            >
              <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <strong>{p.slug}</strong>
                <span style={{ opacity: 0.6, fontSize: "0.85rem" }}>{p.scamCategory}</span>
              </header>
              <p style={{ opacity: 0.75, fontStyle: "italic", margin: "0.5rem 0" }}>{p.rationale}</p>
              <details>
                <summary style={{ cursor: "pointer", opacity: 0.7 }}>System prompt</summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: "0.85rem",
                    marginTop: "0.5rem",
                    opacity: 0.9,
                  }}
                >
                  {p.systemPrompt}
                </pre>
              </details>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => run(p._id, "approve")}
                  disabled={busy}
                  style={{
                    padding: "0.4rem 0.9rem",
                    borderRadius: 6,
                    border: "1px solid #2f7d3a",
                    background: state === "approve" ? "#1d4a23" : "#163a1a",
                    color: "#cfe9d4",
                    cursor: busy ? "not-allowed" : "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  {state === "approve" ? "Approving…" : "Approve"}
                </button>
                <button
                  type="button"
                  onClick={() => run(p._id, "deny")}
                  disabled={busy}
                  style={{
                    padding: "0.4rem 0.9rem",
                    borderRadius: 6,
                    border: "1px solid #5a2222",
                    background: state === "deny" ? "#3d1717" : "#2a1010",
                    color: "#e9cfcf",
                    cursor: busy ? "not-allowed" : "pointer",
                    fontSize: "0.85rem",
                  }}
                >
                  {state === "deny" ? "Denying…" : "Deny"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

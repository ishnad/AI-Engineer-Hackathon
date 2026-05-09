"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function ProposedPersonas() {
  const items = useQuery(api.proposedPersonas.recent, { limit: 6 });
  if (!items || items.length === 0) return null;

  return (
    <section style={{ marginTop: "3rem" }}>
      <h2>Proposed personas (meta-agent)</h2>
      <p style={{ opacity: 0.6, fontSize: "0.9rem", marginTop: 0 }}>
        GPT-5.5 drafts a new persona body whenever a fresh scam cluster appears.
        Maintainer copies into <code>personas/src/&lt;slug&gt;.ts</code>.
      </p>
      <div style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        {items.map((p) => (
          <article
            key={p._id}
            style={{ padding: "1rem", border: "1px solid #222", borderRadius: 8 }}
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
          </article>
        ))}
      </div>
    </section>
  );
}

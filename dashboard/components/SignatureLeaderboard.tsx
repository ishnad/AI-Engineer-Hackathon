"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function SignatureLeaderboard() {
  const sigs = useQuery(api.signatures.leaderboard, { limit: 8 });
  if (!sigs || sigs.length === 0) return null;

  return (
    <section style={{ marginTop: "3rem" }}>
      <h2>Trending scam scripts</h2>
      <ol style={{ paddingLeft: "1.25rem", display: "grid", gap: "0.5rem", lineHeight: 1.4 }}>
        {sigs.map((s) => (
          <li key={s._id} style={{ opacity: 0.9 }}>
            <code style={{ background: "#111", padding: "0.1rem 0.4rem", borderRadius: 4 }}>
              {s.signatureHash.slice(0, 8)}
            </code>
            {" — "}
            {s.claimedOrg ?? "unknown org"}
            {" · "}
            <span style={{ opacity: 0.65 }}>{s.tactics.slice(0, 3).join(", ") || "no tactics"}</span>
            {" · "}
            <strong>{s.count}×</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

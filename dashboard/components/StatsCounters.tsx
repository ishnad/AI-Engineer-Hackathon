"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function StatsCounters() {
  const stats = useQuery(api.liveStats.get);
  const personas = useQuery(api.personas.all);
  const sigs = useQuery(api.signatures.leaderboard, { limit: 100 });

  return (
    <section
      style={{
        marginTop: "3rem",
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      }}
    >
      <Stat label="Scammer-minutes wasted" value={fmt(stats?.totalScammerMinutes)} />
      <Stat label="Calls intercepted" value={String(stats?.totalCalls ?? "—")} />
      <Stat label="Active personas" value={String(personas?.length ?? "—")} />
      <Stat label="Signatures collected" value={String(sigs?.length ?? "—")} />
      <Stat label="Median post-call ms" value={fmtMs(stats?.pipelineMsRecent)} />
    </section>
  );
}

function fmtMs(samples: number[] | undefined): string {
  if (!samples || samples.length === 0) return "—";
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return `${Math.round(median).toLocaleString()}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "1.25rem", border: "1px solid #222", borderRadius: 8 }}>
      <div style={{ fontSize: "2rem", fontWeight: 600 }}>{value}</div>
      <div style={{ opacity: 0.6, fontSize: "0.9rem" }}>{label}</div>
    </div>
  );
}

function fmt(n: number | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString();
}

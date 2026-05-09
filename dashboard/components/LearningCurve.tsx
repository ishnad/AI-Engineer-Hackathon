"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

// Plain SVG sparkline — avoids pulling in a chart library for one panel.
export function LearningCurve() {
  const personas = useQuery(api.personas.all);
  if (!personas || personas.length === 0) return null;

  return (
    <section style={{ marginTop: "3rem" }}>
      <h2>Learning curve</h2>
      <p style={{ opacity: 0.6, marginTop: 0 }}>
        Adaption Labs rewrites each persona&apos;s system prompt every 5 calls. Higher = longer scammer hold-time.
      </p>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {personas.map((p) => (
          <Row
            key={p._id}
            name={p.name}
            version={p.version}
            avg={p.avgDurationSec}
            calls={p.callsHandled}
          />
        ))}
      </div>
    </section>
  );
}

function Row({ name, version, avg, calls }: { name: string; version: number; avg: number; calls: number }) {
  const widthPct = Math.min(100, (avg / 600) * 100); // cap at 10 minutes
  return (
    <div style={{ padding: "0.75rem 1rem", border: "1px solid #222", borderRadius: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
        <span>
          {name} <span style={{ opacity: 0.5 }}>v{version}</span>
        </span>
        <span style={{ opacity: 0.7 }}>
          {Math.round(avg)}s avg · {calls} calls
        </span>
      </div>
      <div style={{ marginTop: 6, height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${widthPct}%`, height: "100%", background: "#36d399" }} />
      </div>
    </div>
  );
}

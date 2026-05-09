"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function WeeklyRecap() {
  const stats = useQuery(api.liveStats.get);
  const markdown = stats?.weeklyRecapMarkdown;
  const posterUrl = stats?.weeklyRecapPosterUrl;
  if (!markdown && !posterUrl) return null;

  return (
    <section style={{ marginTop: "3rem" }}>
      <h2>This week in scam-fighting</h2>
      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          alignItems: "start",
          marginTop: "0.5rem",
        }}
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt="Ring0 weekly recap poster"
            style={{ width: "100%", borderRadius: 8, background: "#111" }}
          />
        ) : null}
        {markdown ? (
          <div
            style={{
              padding: "1rem",
              border: "1px solid #222",
              borderRadius: 8,
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
            }}
          >
            {markdown}
          </div>
        ) : null}
      </div>
    </section>
  );
}

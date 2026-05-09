"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function MostWanted() {
  const calls = useQuery(api.calls.withPoster, { limit: 8 });
  if (!calls) return null;

  return (
    <section style={{ marginTop: "3rem" }}>
      <h2>Most Wanted</h2>
      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        {calls.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Posters appear after each call is classified.</p>
        ) : (
          calls.map((c) => (
            <figure key={c._id} style={{ margin: 0 }}>
              {c.posterImageUrl && (
                <img
                  src={c.posterImageUrl}
                  alt={c.scamCategory ?? "scam poster"}
                  style={{ width: "100%", borderRadius: 6, display: "block" }}
                />
              )}
              <figcaption style={{ opacity: 0.7, fontSize: "0.8rem", marginTop: "0.4rem" }}>
                {c.scamCategory} · danger {c.dangerScore ?? "—"}/10
              </figcaption>
            </figure>
          ))
        )}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

const STATIC_PERSONAS = ["confused-auntie", "distracted-dad", "curious-teen", "suspicious-auntie"];
const STORAGE_KEY = "ring0:default-persona";

export function PersonaSwap() {
  const approved = useQuery(api.personas.all);
  const [selected, setSelected] = useState<string>("confused-auntie");

  useEffect(() => {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v) setSelected(v);
  }, []);

  const pick = (id: string) => {
    setSelected(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  };

  const ids = Array.from(
    new Set([...STATIC_PERSONAS, ...(approved?.map((p) => p.personaId) ?? [])]),
  );

  return (
    <section style={{ marginTop: "3rem" }}>
      <h2>Default persona</h2>
      <p style={{ opacity: 0.6, fontSize: "0.9rem", marginTop: 0 }}>
        Used when no scam signature matches. Pick one to set the fallback voice.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
        {ids.map((id) => {
          const isSelected = id === selected;
          return (
            <button
              key={id}
              type="button"
              onClick={() => pick(id)}
              style={{
                padding: "0.5rem 0.9rem",
                borderRadius: 999,
                border: `1px solid ${isSelected ? "#4d9eff" : "#333"}`,
                background: isSelected ? "#0e2a4a" : "#141414",
                color: isSelected ? "#cfe2ff" : "#bbb",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              {isSelected ? "● " : ""}{id}
            </button>
          );
        })}
      </div>
    </section>
  );
}

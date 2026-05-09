"use client";

import { useState } from "react";
import { LearningCurve } from "./LearningCurve";
import { LiveTranscripts } from "./LiveTranscripts";
import { MostWanted } from "./MostWanted";
import { PersonaSwap } from "./PersonaSwap";
import { ProposedPersonas } from "./ProposedPersonas";
import { SignatureLeaderboard } from "./SignatureLeaderboard";
import { StatsCounters } from "./StatsCounters";
import { WeeklyRecap } from "./WeeklyRecap";

export function Ring0Experience() {
  const [started, setStarted] = useState(false);

  if (!started) {
    return (
      <main className="home-splash">
        <button className="home-splash__title-button" type="button" onClick={() => setStarted(true)}>
          Ring0
        </button>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-hero">
        <div>
          <p className="dashboard-hero__eyebrow">Live defence console</p>
          <h1>Ring0</h1>
          <p>We don&apos;t block scammers. We answer them.</p>
        </div>
        <div className="dashboard-hero__status">
          <span />
          Active
        </div>
      </header>

      <StatsCounters />
      <LiveTranscripts />
      <WeeklyRecap />
      <MostWanted />
      <LearningCurve />
      <SignatureLeaderboard />
      <ProposedPersonas />
      <PersonaSwap />
    </main>
  );
}

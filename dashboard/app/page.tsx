import { LearningCurve } from "../components/LearningCurve";
import { LiveTranscripts } from "../components/LiveTranscripts";
import { MostWanted } from "../components/MostWanted";
import { ProposedPersonas } from "../components/ProposedPersonas";
import { SignatureLeaderboard } from "../components/SignatureLeaderboard";
import { StatsCounters } from "../components/StatsCounters";
import { WeeklyRecap } from "../components/WeeklyRecap";

export default function HomePage() {
  return (
    <main style={{ padding: "4rem 2rem", maxWidth: 1100, margin: "0 auto" }}>
      <header>
        <h1 style={{ fontSize: "3rem", margin: 0 }}>Ring0</h1>
        <p style={{ opacity: 0.7, marginTop: "0.5rem" }}>
          We don&apos;t block scammers. We answer them.
        </p>
      </header>

      <StatsCounters />
      <WeeklyRecap />
      <LiveTranscripts />
      <MostWanted />
      <LearningCurve />
      <SignatureLeaderboard />
      <ProposedPersonas />
    </main>
  );
}

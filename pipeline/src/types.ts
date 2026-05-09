// Shape of every message that lands on the post-call queue.
export interface PostCallJob {
  callSid: string;
  personaId: string;
  durationSec: number;
  audioKey: string;
  transcript: TranscriptTurn[];
  // Caller's phone number (Twilio `From`). Optional — may be absent on
  // legacy/test paths or anonymous callers.
  fromPhone?: string;
}

export interface TranscriptTurn {
  role: "user" | "agent";
  text: string;
  t: number;
}

// Output of the GPT-5.5 extraction agent (block 6).
export interface ScamSignature {
  signatureHash: string;
  scamCategory: string; // e.g. "tech-support", "irs-impersonation"
  claimedOrg: string | null;
  tactics: string[]; // e.g. ["urgency", "authority", "isolation"]
  targetDemographic: string | null;
  dangerScore: number; // 0–10
  summary: string;
  proposedActions: string[];
}

export interface OpenAIOptions {
  apiKey: string;
  model: string;
  // Override for the local mock harness; falls back to api.openai.com.
  baseUrl?: string;
}

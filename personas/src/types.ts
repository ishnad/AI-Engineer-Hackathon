export interface Persona {
  id: string;
  name: string;
  voiceHint: string;
  // Full system prompt — must include the stalling toolkit and guardrails.
  systemPrompt: string;
  version: number;
}

export type PersonaId =
  | "confused-auntie"
  | "distracted-dad"
  | "curious-teen"
  | "suspicious-auntie";

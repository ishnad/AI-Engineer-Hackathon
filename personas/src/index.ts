import { confusedAuntie } from "./confused-auntie";
import { curiousTeen } from "./curious-teen";
import { distractedDad } from "./distracted-dad";
import { suspiciousAuntie } from "./suspicious-auntie";
import type { Persona, PersonaId } from "./types";

export type { Persona, PersonaId } from "./types";
export { HARD_GUARDRAILS, STALLING_TOOLKIT } from "./stalling";

export const personas: Record<PersonaId, Persona> = {
  "confused-auntie": confusedAuntie,
  "distracted-dad": distractedDad,
  "curious-teen": curiousTeen,
  "suspicious-auntie": suspiciousAuntie,
};

export function resolvePersona(id: PersonaId): Persona {
  return personas[id];
}

export function listPersonas(): Persona[] {
  return Object.values(personas);
}

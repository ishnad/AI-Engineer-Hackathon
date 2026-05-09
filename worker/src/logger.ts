// One-line JSON structured logger. Wrangler tail and CF Logpush both treat
// stdout JSON as structured fields, so we keep every record flat.

export interface LogFields {
  callSid?: string;
  step?: string;
  totalMs?: number;
  stepMs?: number;
  [key: string]: unknown;
}

export function logInfo(event: LogFields): void {
  console.log(serialize("info", event));
}

export function logError(event: LogFields, err?: unknown): void {
  console.error(
    serialize("error", {
      ...event,
      err: err instanceof Error ? err.message : err === undefined ? undefined : String(err),
    }),
  );
}

function serialize(level: "info" | "error", event: LogFields): string {
  return JSON.stringify({ ts: new Date().toISOString(), level, ...event });
}

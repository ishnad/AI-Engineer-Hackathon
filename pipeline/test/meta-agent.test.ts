import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPersonaAuthorPrompt, proposePersona } from "../src/meta-agent";
import type { ScamSignature } from "../src/types";

const sig: ScamSignature = {
  signatureHash: "abc123def456",
  scamCategory: "Crypto Recovery",
  claimedOrg: "FBI Cyber Division",
  tactics: ["urgency", "authority", "fake-recovery-fee"],
  targetDemographic: "elderly",
  dangerScore: 8,
  summary: "Cold-calls past crypto theft victims claiming they can recover funds for an upfront fee.",
};

describe("buildPersonaAuthorPrompt", () => {
  it("slugifies the scam category and embeds every field in the user prompt", () => {
    const { slug, systemInstructions, userPrompt } = buildPersonaAuthorPrompt(sig);
    expect(slug).toBe("crypto-recovery");
    expect(systemInstructions).toContain("STALLING_TOOLKIT");
    expect(systemInstructions).toContain("HARD_GUARDRAILS");
    expect(systemInstructions).toContain("JSON only");
    expect(userPrompt).toContain("personas/src/crypto-recovery.ts");
    expect(userPrompt).toContain("FBI Cyber Division");
    expect(userPrompt).toContain("urgency, authority, fake-recovery-fee");
    expect(userPrompt).toContain("elderly");
    expect(userPrompt).toContain("8/10");
    expect(userPrompt).toContain(sig.summary);
  });

  it("falls back to 'unknown' for missing claimedOrg + n/a tactics", () => {
    const { userPrompt } = buildPersonaAuthorPrompt({
      ...sig,
      claimedOrg: null,
      tactics: [],
      targetDemographic: null,
    });
    expect(userPrompt).toContain("impersonating: unknown");
    expect(userPrompt).toContain("tactics: n/a");
    expect(userPrompt).toContain("target demographic: n/a");
  });

  it("produces a safe slug for categories with punctuation/whitespace", () => {
    const { slug } = buildPersonaAuthorPrompt({ ...sig, scamCategory: "  IRS / Back-Tax!! " });
    expect(slug).toBe("irs-back-tax");
  });

  it("falls back to 'unknown' when the category collapses to an empty slug", () => {
    const { slug } = buildPersonaAuthorPrompt({ ...sig, scamCategory: "!!!" });
    expect(slug).toBe("unknown");
  });
});

describe("proposePersona — dry-run mode", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("logs the persona-author prompt and returns a stub without hitting OpenAI", async () => {
    const result = await proposePersona(sig, {
      apiKey: "x",
      model: "gpt-5.5",
      dryRun: true,
    });

    expect(result).toEqual({
      slug: "crypto-recovery",
      scamCategory: "Crypto Recovery",
      signatureHash: sig.signatureHash,
      systemPrompt: "[dry-run]",
      rationale: "[dry-run]",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);

    const logged = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(logged.step).toBe("metaAgent.dryrun");
    expect(logged.slug).toBe("crypto-recovery");
    expect(logged.signatureHash).toBe(sig.signatureHash);
    expect(logged.userPrompt).toContain("personas/src/crypto-recovery.ts");
    expect(logged.systemInstructions).toContain("STALLING_TOOLKIT");
  });
});

describe("proposePersona — live mode", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify({
          systemPrompt: "You are Doris, a meandering retiree on the line with a 'crypto recovery' scammer. STALLING_TOOLKIT. HARD_GUARDRAILS.",
          rationale: "Doris's anecdotal style maximizes time-on-call against authority-pressure scripts.",
        }),
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the OpenAI Responses API and returns the parsed proposal", async () => {
    const result = await proposePersona(sig, { apiKey: "k", model: "gpt-5.5" });
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("crypto-recovery");
    expect(result!.scamCategory).toBe("Crypto Recovery");
    expect(result!.signatureHash).toBe(sig.signatureHash);
    expect(result!.systemPrompt).toContain("Doris");
    expect(result!.rationale).toContain("authority-pressure");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/v1/responses");
    const body = JSON.parse((init as any).body);
    expect(body.model).toBe("gpt-5.5");
  });

  it("tolerates JSON wrapped in markdown fences", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        output_text:
          '```json\n{"systemPrompt":"You are X. STALLING_TOOLKIT. HARD_GUARDRAILS.","rationale":"because"}\n```',
      }),
      text: async () => "",
    });

    const result = await proposePersona(sig, { apiKey: "k", model: "gpt-5.5" });
    expect(result!.systemPrompt).toContain("STALLING_TOOLKIT");
    expect(result!.rationale).toBe("because");
  });

  it("throws when the response has no systemPrompt", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ output_text: '{"rationale":"missing prompt"}' }),
      text: async () => "",
    });

    await expect(proposePersona(sig, { apiKey: "k", model: "gpt-5.5" })).rejects.toThrow(
      /systemPrompt/,
    );
  });

  it("honors baseUrl for the local mock harness", async () => {
    await proposePersona(sig, {
      apiKey: "k",
      model: "gpt-5.5",
      baseUrl: "http://127.0.0.1:8766",
    });
    const [url] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("http://127.0.0.1:8766/v1/responses");
  });
});

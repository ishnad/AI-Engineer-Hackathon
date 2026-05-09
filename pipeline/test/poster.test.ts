import { beforeEach, describe, expect, it, vi } from "vitest";
import { generatePoster } from "../src/poster";
import type { ScamSignature } from "../src/types";

const imagesGenerate = vi.fn();
const responsesCreate = vi.fn();

vi.mock("../src/openai", () => ({
  createOpenAI: () => ({ imagesGenerate, responsesCreate }),
}));

beforeEach(() => {
  imagesGenerate.mockReset();
  responsesCreate.mockReset();
});

const baseSig: ScamSignature = {
  signatureHash: "abc123def456",
  scamCategory: "tech-support",
  claimedOrg: "Microsoft",
  tactics: ["impersonation", "urgency", "remote-access", "fake-refund"],
  targetDemographic: "elderly",
  dangerScore: 7,
  summary: "Tech support scam.",
};

const opts = { apiKey: "test", model: "gpt-image-2" };

function lastPrompt(): string {
  const body = imagesGenerate.mock.calls.at(-1)![0] as { prompt: string };
  return body.prompt;
}

describe("generatePoster — prompt building", () => {
  beforeEach(() => {
    imagesGenerate.mockResolvedValue({ data: [{ url: "https://example.com/a.png" }] });
  });

  it("uses the category-specific style", async () => {
    await generatePoster(baseSig, opts);
    expect(lastPrompt()).toContain("noir crime poster");
    expect(lastPrompt()).toContain("tech-support");
  });

  it("falls back to the default style for unknown categories", async () => {
    await generatePoster({ ...baseSig, scamCategory: "lottery-prize" }, opts);
    expect(lastPrompt()).toContain("WANTED poster");
    expect(lastPrompt()).toContain("Wild West");
  });

  it("includes claimedOrg only when set", async () => {
    await generatePoster(baseSig, opts);
    expect(lastPrompt()).toContain("Impersonating: Microsoft");

    imagesGenerate.mockClear();
    await generatePoster({ ...baseSig, claimedOrg: null }, opts);
    expect(lastPrompt()).not.toContain("Impersonating:");
  });

  it("trims tactic caption to the first three", async () => {
    await generatePoster(baseSig, opts);
    const p = lastPrompt();
    expect(p).toContain("impersonation");
    expect(p).toContain("urgency");
    expect(p).toContain("remote-access");
    expect(p).not.toContain("fake-refund");
  });

  it("uses a 6-char hash slice in the subheadline", async () => {
    await generatePoster(baseSig, opts);
    expect(lastPrompt()).toContain("Ring0 #abc123");
    expect(lastPrompt()).not.toContain("abc123def456"); // not the full hash
  });

  it("enforces the no-faces guardrail", async () => {
    await generatePoster(baseSig, opts);
    const p = lastPrompt();
    expect(p).toContain("No real faces");
    expect(p).toContain("No real names");
  });
});

describe("generatePoster — response handling", () => {
  it("returns the URL when present", async () => {
    imagesGenerate.mockResolvedValue({ data: [{ url: "https://cdn/x.png" }] });
    expect(await generatePoster(baseSig, opts)).toBe("https://cdn/x.png");
  });

  it("falls back to a data URL when only b64_json is returned", async () => {
    imagesGenerate.mockResolvedValue({ data: [{ b64_json: "AAAA" }] });
    expect(await generatePoster(baseSig, opts)).toBe("data:image/png;base64,AAAA");
  });

  it("throws when the response has no image", async () => {
    imagesGenerate.mockResolvedValue({ data: [{}] });
    await expect(generatePoster(baseSig, opts)).rejects.toThrow();
  });

  it("throws when data is empty", async () => {
    imagesGenerate.mockResolvedValue({ data: [] });
    await expect(generatePoster(baseSig, opts)).rejects.toThrow();
  });
});

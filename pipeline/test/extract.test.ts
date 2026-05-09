import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractSignature } from "../src/extract";
import type { PostCallJob } from "../src/types";

const responsesCreate = vi.fn();
const imagesGenerate = vi.fn();

vi.mock("../src/openai", () => ({
  createOpenAI: () => ({ responsesCreate, imagesGenerate }),
}));

beforeEach(() => {
  responsesCreate.mockReset();
  imagesGenerate.mockReset();
});

const job: PostCallJob = {
  callSid: "CA-test",
  personaId: "confused-auntie",
  durationSec: 60,
  audioKey: "raw/CA-test.ulaw",
  transcript: [
    { role: "agent", t: 0, text: "Hello?" },
    { role: "user", t: 2000, text: "Ma'am, this is the IRS." },
    { role: "agent", t: 4000, text: "The what now?" },
  ],
};

const opts = { apiKey: "test", model: "gpt-5.5" };

function functionCall(name: string, args: unknown, id = `call-${name}`) {
  return { type: "function_call", call_id: id, name, arguments: JSON.stringify(args) };
}

describe("extractSignature — agent loop", () => {
  it("terminates and returns a signature when the model calls submit_signature", async () => {
    responsesCreate.mockResolvedValueOnce({
      output: [
        functionCall("submit_signature", {
          scamCategory: "irs-impersonation",
          claimedOrg: "IRS",
          tactics: ["urgency", "authority"],
          dangerScore: 8,
          summary: "Pretended to be the IRS demanding payment.",
        }),
      ],
    });

    const sig = await extractSignature(job, opts);

    expect(responsesCreate).toHaveBeenCalledTimes(1);
    expect(sig.scamCategory).toBe("irs-impersonation");
    expect(sig.tactics).toEqual(["authority", "urgency"]); // sorted
    expect(sig.dangerScore).toBe(8);
    expect(sig.signatureHash).toMatch(/^[0-9a-f]{13,16}$/);
  });

  it("feeds tool outputs back and continues until submit_signature", async () => {
    responsesCreate.mockResolvedValueOnce({
      output: [functionCall("search_prior_signatures", { query: "irs" }, "c1")],
    });
    responsesCreate.mockResolvedValueOnce({
      output: [
        functionCall(
          "submit_signature",
          {
            scamCategory: "irs-impersonation",
            tactics: ["fear"],
            dangerScore: 7,
            summary: "ok",
          },
          "c2",
        ),
      ],
    });

    const sig = await extractSignature(job, opts);
    expect(responsesCreate).toHaveBeenCalledTimes(2);

    // 2nd call must include both the search call and its output as context.
    const secondInput = responsesCreate.mock.calls[1]![0].input as any[];
    const types = secondInput.map((m) => m.type ?? m.role);
    expect(types).toContain("function_call");
    expect(types).toContain("function_call_output");
    expect(sig.scamCategory).toBe("irs-impersonation");
  });

  it("returns the unclassified fallback when the model never calls submit_signature", async () => {
    // Model just keeps thinking — six empty turns.
    responsesCreate.mockResolvedValue({ output: [] });
    const sig = await extractSignature(job, opts);
    expect(sig.scamCategory).toBe("unclassified");
    expect(sig.dangerScore).toBe(0);
    expect(responsesCreate.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("clamps dangerScore to [0, 10] and survives non-numeric input", async () => {
    responsesCreate.mockResolvedValueOnce({
      output: [
        functionCall("submit_signature", {
          scamCategory: "x",
          tactics: [],
          dangerScore: 99,
          summary: "",
        }),
      ],
    });
    const a = await extractSignature(job, opts);
    expect(a.dangerScore).toBe(10);

    responsesCreate.mockResolvedValueOnce({
      output: [
        functionCall("submit_signature", {
          scamCategory: "x",
          tactics: [],
          dangerScore: "not-a-number" as unknown as number,
          summary: "",
        }),
      ],
    });
    const b = await extractSignature(job, opts);
    expect(b.dangerScore).toBe(0);
  });
});

describe("signatureHash stability", () => {
  it("is deterministic across calls with equivalent inputs", async () => {
    const submit = functionCall("submit_signature", {
      scamCategory: "tech-support",
      claimedOrg: "Microsoft",
      tactics: ["impersonation", "urgency"],
      dangerScore: 6,
      summary: "ok",
    });
    responsesCreate.mockResolvedValue({ output: [submit] });

    const a = await extractSignature(job, opts);
    const b = await extractSignature(job, opts);
    expect(a.signatureHash).toBe(b.signatureHash);
  });

  it("is invariant to tactic ordering (so clusters don't fragment)", async () => {
    responsesCreate.mockResolvedValueOnce({
      output: [
        functionCall("submit_signature", {
          scamCategory: "tech-support",
          claimedOrg: "Microsoft",
          tactics: ["urgency", "impersonation"],
          dangerScore: 6,
          summary: "",
        }),
      ],
    });
    const a = await extractSignature(job, opts);

    responsesCreate.mockResolvedValueOnce({
      output: [
        functionCall("submit_signature", {
          scamCategory: "tech-support",
          claimedOrg: "Microsoft",
          tactics: ["impersonation", "urgency"],
          dangerScore: 6,
          summary: "",
        }),
      ],
    });
    const b = await extractSignature(job, opts);

    expect(a.signatureHash).toBe(b.signatureHash);
  });

  it("differs when category or org differ", async () => {
    responsesCreate.mockResolvedValueOnce({
      output: [
        functionCall("submit_signature", {
          scamCategory: "tech-support",
          tactics: ["urgency"],
          dangerScore: 5,
          summary: "",
        }),
      ],
    });
    const a = await extractSignature(job, opts);

    responsesCreate.mockResolvedValueOnce({
      output: [
        functionCall("submit_signature", {
          scamCategory: "irs-impersonation",
          tactics: ["urgency"],
          dangerScore: 5,
          summary: "",
        }),
      ],
    });
    const b = await extractSignature(job, opts);

    expect(a.signatureHash).not.toBe(b.signatureHash);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { calls } = vi.hoisted(() => ({
  calls: {
    extract: [] as any[],
    poster: [] as any[],
    tune: [] as any[],
    propose: [] as any[],
  },
}));

const { control } = vi.hoisted(() => ({
  control: {
    extractThrows: false,
    posterThrows: false,
    tuneThrows: false,
    proposeThrows: false,
    proposeReturnsNull: false,
  },
}));

vi.mock("@ring0/pipeline", () => ({
  extractSignature: vi.fn(async (job: any, opts: any) => {
    calls.extract.push({ job, opts });
    if (control.extractThrows) throw new Error("extract failed");
    return {
      signatureHash: "sig-abc",
      scamCategory: "irs-impersonation",
      claimedOrg: "IRS",
      tactics: ["urgency", "authority"],
      targetDemographic: "elderly",
      dangerScore: 8,
      summary: "fake IRS agent demands gift-card payment",
    };
  }),
  generatePoster: vi.fn(async (sig: any, opts: any) => {
    calls.poster.push({ sig, opts });
    if (control.posterThrows) throw new Error("poster failed");
    return "https://posters.test/sig-abc.png";
  }),
  tunePersona: vi.fn(async (job: any, opts: any) => {
    calls.tune.push({ job, opts });
    if (control.tuneThrows) throw new Error("tune failed");
  }),
  proposePersona: vi.fn(async (sig: any, opts: any) => {
    calls.propose.push({ sig, opts });
    if (control.proposeThrows) throw new Error("propose failed");
    if (control.proposeReturnsNull) return null;
    return {
      slug: "irs-impersonation",
      scamCategory: sig.scamCategory,
      signatureHash: sig.signatureHash,
      systemPrompt: "stub system prompt",
      rationale: "stub rationale",
    };
  }),
}));

import { handlePostCallBatch } from "../src/queue-consumer";

interface FakeMessage {
  body: any;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
}

function makeJob(overrides: Partial<any> = {}): any {
  return {
    callSid: "CA-test",
    personaId: "confused-auntie",
    durationSec: 73,
    audioKey: "raw/CA-test.ulaw",
    transcript: [
      { role: "agent", text: "hello?", t: 0 },
      { role: "user", text: "this is the IRS", t: 1 },
    ],
    ...overrides,
  };
}

function makeBatch(jobs: any[]): { batch: any; messages: FakeMessage[] } {
  const messages: FakeMessage[] = jobs.map((body) => ({
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  }));
  return { batch: { messages } as any, messages };
}

function makeEnv(overrides: Partial<any> = {}): any {
  return {
    SIGNATURES: { upsert: vi.fn(async () => {}) },
    CONVEX_URL: "https://convex.test",
    OPENAI_API_KEY: "openai-k",
    OPENAI_BASE_URL: undefined,
    RING0_META_DRYRUN: undefined,
    ...overrides,
  };
}

function fetchOk() {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  }));
}

function flushMicrotasks() {
  return new Promise((r) => setTimeout(r, 0));
}

describe("handlePostCallBatch", () => {
  beforeEach(async () => {
    calls.extract.length = 0;
    calls.poster.length = 0;
    calls.tune.length = 0;
    calls.propose.length = 0;
    control.extractThrows = false;
    control.posterThrows = false;
    control.tuneThrows = false;
    control.proposeThrows = false;
    control.proposeReturnsNull = false;
    const pipeline = await import("@ring0/pipeline");
    (pipeline.extractSignature as any).mockImplementation(async (job: any, opts: any) => {
      calls.extract.push({ job, opts });
      if (control.extractThrows) throw new Error("extract failed");
      return {
        signatureHash: "sig-abc",
        scamCategory: "irs-impersonation",
        claimedOrg: "IRS",
        tactics: ["urgency", "authority"],
        targetDemographic: "elderly",
        dangerScore: 8,
        summary: "fake IRS agent demands gift-card payment",
      };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs the full pipeline on a clean job and acks the message", async () => {
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);
    const env = makeEnv();
    const { batch, messages } = makeBatch([makeJob()]);

    await handlePostCallBatch(batch, env);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(messages[0]!.ack).toHaveBeenCalledTimes(1);
    expect(messages[0]!.retry).not.toHaveBeenCalled();

    expect(calls.extract).toHaveLength(1);
    expect(calls.extract[0].opts.apiKey).toBe("openai-k");
    expect(calls.extract[0].opts.model).toBe("gpt-5.5");

    expect(calls.poster).toHaveLength(1);
    expect(calls.poster[0].opts.model).toBe("gpt-image-2");

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("https://convex.test/ring0/call/ended");
    expect(urls).toContain("https://convex.test/ring0/signature");
    expect(urls).toContain("https://convex.test/ring0/poster");
    expect(urls).toContain("https://convex.test/ring0/proposed-persona");
    expect(urls).not.toContain("https://convex.test/ring0/hold-music");

    expect(env.SIGNATURES.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = env.SIGNATURES.upsert.mock.calls[0]![0]![0];
    expect(upsertArg.id).toBe("sig-abc");
    expect(upsertArg.values).toHaveLength(768);
  });

  it("retries the message when extraction throws", async () => {
    vi.stubGlobal("fetch", fetchOk());
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    control.extractThrows = true;
    const env = makeEnv();
    const { batch, messages } = makeBatch([makeJob()]);

    await handlePostCallBatch(batch, env);

    expect(messages[0]!.ack).not.toHaveBeenCalled();
    expect(messages[0]!.retry).toHaveBeenCalledTimes(1);
    expect(calls.poster).toHaveLength(0);
    errSpy.mockRestore();
  });

  it("still acks when poster fails — a missing image shouldn't kill the signature", async () => {
    vi.stubGlobal("fetch", fetchOk());
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    control.posterThrows = true;
    const env = makeEnv();
    const { batch, messages } = makeBatch([makeJob()]);

    await handlePostCallBatch(batch, env);
    await flushMicrotasks();

    expect(messages[0]!.ack).toHaveBeenCalledTimes(1);
    expect(messages[0]!.retry).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("fires meta-agent and tuner in the background and swallows their errors", async () => {
    vi.stubGlobal("fetch", fetchOk());
    control.tuneThrows = true;
    control.proposeThrows = true;
    const env = makeEnv();
    const { batch, messages } = makeBatch([makeJob()]);

    await handlePostCallBatch(batch, env);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(messages[0]!.ack).toHaveBeenCalledTimes(1);
    expect(calls.tune).toHaveLength(1);
    expect(calls.propose).toHaveLength(1);
  });

  it("skips posting /ring0/proposed-persona when the meta-agent returns null", async () => {
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);
    control.proposeReturnsNull = true;
    const env = makeEnv();
    const { batch } = makeBatch([makeJob()]);

    await handlePostCallBatch(batch, env);
    await flushMicrotasks();
    await flushMicrotasks();

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).not.toContain("https://convex.test/ring0/proposed-persona");
  });

  it("forwards RING0_META_DRYRUN=1 into the meta-agent", async () => {
    vi.stubGlobal("fetch", fetchOk());
    const env = makeEnv({ RING0_META_DRYRUN: "1" });
    const { batch } = makeBatch([makeJob()]);

    await handlePostCallBatch(batch, env);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(calls.propose[0].opts.dryRun).toBe(true);
  });

  it("processes every message in the batch independently", async () => {
    vi.stubGlobal("fetch", fetchOk());
    const env = makeEnv();
    const { batch, messages } = makeBatch([
      makeJob({ callSid: "CA-1" }),
      makeJob({ callSid: "CA-2" }),
      makeJob({ callSid: "CA-3" }),
    ]);

    await handlePostCallBatch(batch, env);

    expect(calls.extract).toHaveLength(3);
    expect(messages.every((m) => m.ack.mock.calls.length === 1)).toBe(true);
    expect(messages.every((m) => m.retry.mock.calls.length === 0)).toBe(true);
  });

  it("isolates a failing job from succeeding ones in the same batch", async () => {
    vi.stubGlobal("fetch", fetchOk());
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const env = makeEnv();

    let callIdx = 0;
    const pipeline = await import("@ring0/pipeline");
    (pipeline.extractSignature as any).mockImplementation(async () => {
      callIdx++;
      if (callIdx === 2) throw new Error("middle fails");
      return {
        signatureHash: `sig-${callIdx}`,
        scamCategory: "tech-support",
        claimedOrg: null,
        tactics: ["urgency"],
        targetDemographic: null,
        dangerScore: 5,
        summary: "x",
      };
    });

    const { batch, messages } = makeBatch([
      makeJob({ callSid: "CA-1" }),
      makeJob({ callSid: "CA-2" }),
      makeJob({ callSid: "CA-3" }),
    ]);

    await handlePostCallBatch(batch, env);

    expect(messages[0]!.ack).toHaveBeenCalledTimes(1);
    expect(messages[1]!.retry).toHaveBeenCalledTimes(1);
    expect(messages[1]!.ack).not.toHaveBeenCalled();
    expect(messages[2]!.ack).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });

  it("posts pipeline latency to /ring0/pipeline-stats after a successful run", async () => {
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);
    const env = makeEnv();
    const { batch, messages } = makeBatch([makeJob()]);

    await handlePostCallBatch(batch, env);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(messages[0]!.ack).toHaveBeenCalledTimes(1);
    const statsCall = fetchMock.mock.calls.find(
      (c) => String(c[0]) === "https://convex.test/ring0/pipeline-stats",
    );
    expect(statsCall).toBeTruthy();
    const body = JSON.parse((statsCall![1] as any).body);
    expect(body.callSid).toBe("CA-test");
    expect(typeof body.totalMs).toBe("number");
    expect(body.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("does NOT post pipeline latency when the job is retried", async () => {
    const fetchMock = fetchOk();
    vi.stubGlobal("fetch", fetchMock);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    control.extractThrows = true;
    const env = makeEnv();
    const { batch } = makeBatch([makeJob()]);

    await handlePostCallBatch(batch, env);
    await flushMicrotasks();

    const statsCall = fetchMock.mock.calls.find(
      (c) => String(c[0]) === "https://convex.test/ring0/pipeline-stats",
    );
    expect(statsCall).toBeFalsy();
    errSpy.mockRestore();
  });

  it("forwards OPENAI_BASE_URL into pipeline options when set (mock harness path)", async () => {
    vi.stubGlobal("fetch", fetchOk());
    const env = makeEnv({ OPENAI_BASE_URL: "http://localhost:9001" });
    const { batch } = makeBatch([makeJob()]);

    await handlePostCallBatch(batch, env);

    expect(calls.extract[0].opts.baseUrl).toBe("http://localhost:9001");
    expect(calls.poster[0].opts.baseUrl).toBe("http://localhost:9001");
  });
});

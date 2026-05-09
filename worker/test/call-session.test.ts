import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { base64ToBytes, bytesToBase64 } from "../src/audio";

type FakeOpts = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  endpoint?: string;
  onAudio: (pcm: ArrayBuffer) => void;
  onTranscript: (text: string, role: "user" | "agent") => void;
  onClose: () => void;
};

const { geminis, realtimes, control } = vi.hoisted(() => ({
  geminis: [] as Array<{ opts: FakeOpts; audioSent: ArrayBuffer[]; closed: boolean }>,
  realtimes: [] as Array<{ opts: FakeOpts; audioSent: ArrayBuffer[]; closed: boolean }>,
  control: { connectShouldThrow: false },
}));

vi.mock("../src/gemini", () => {
  class FakeGeminiLive {
    opts: FakeOpts;
    audioSent: ArrayBuffer[] = [];
    closed = false;
    constructor(opts: FakeOpts) {
      this.opts = opts;
      geminis.push(this as any);
    }
    async connect(): Promise<void> {
      if (control.connectShouldThrow) throw new Error("connect failed");
    }
    sendAudio(pcm: ArrayBuffer): void {
      this.audioSent.push(pcm);
    }
    close(): void {
      this.closed = true;
    }
  }
  return { GeminiLive: FakeGeminiLive };
});

const { postCallCalls } = vi.hoisted(() => ({
  postCallCalls: [] as Array<{ batch: any; env: any }>,
}));

vi.mock("../src/queue-consumer", () => ({
  handlePostCallBatch: vi.fn(async (batch: any, env: any) => {
    postCallCalls.push({ batch, env });
  }),
}));

vi.mock("../src/realtime", () => {
  class FakeOpenAIRealtime {
    opts: FakeOpts;
    audioSent: ArrayBuffer[] = [];
    closed = false;
    constructor(opts: FakeOpts) {
      this.opts = opts;
      realtimes.push(this as any);
    }
    async connect(): Promise<void> {
      if (control.connectShouldThrow) throw new Error("connect failed");
    }
    sendAudio(pcm: ArrayBuffer): void {
      this.audioSent.push(pcm);
    }
    close(): void {
      this.closed = true;
    }
  }
  return { OpenAIRealtime: FakeOpenAIRealtime };
});

class FakeWS {
  private listeners = new Map<string, Set<(ev: any) => void>>();
  readyState = 1;
  sent: string[] = [];
  closed = false;
  accept(): void {}
  addEventListener(type: string, h: (ev: any) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(h);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.dispatch("close", { code: 1000 });
  }
  dispatch(type: string, ev: any): void {
    this.listeners.get(type)?.forEach((h) => h(ev));
  }
}

let lastPair: { client: FakeWS; server: FakeWS } | null = null;

class FakePair {
  constructor() {
    const client = new FakeWS();
    const server = new FakeWS();
    (this as any)[0] = client;
    (this as any)[1] = server;
    lastPair = { client, server };
  }
}

(globalThis as any).WebSocketPair = FakePair;

import { CallSession } from "../src/call-session";

interface Env {
  CALL_AUDIO: { put: ReturnType<typeof vi.fn> };
  CONVEX_URL: string;
  GEMINI_API_KEY: string;
  GEMINI_LIVE_MODEL: string;
  PUBLIC_WORKER_URL: string;
  OPENAI_API_KEY: string;
  OPENAI_REALTIME_MODEL?: string;
  TWILIO_AUTH_TOKEN: string;
  VOICE_PROVIDER?: string;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    CALL_AUDIO: { put: vi.fn(async () => {}) },
    CONVEX_URL: "https://convex.test",
    GEMINI_API_KEY: "test-key",
    GEMINI_LIVE_MODEL: "gemini-flash-3.1-live",
    PUBLIC_WORKER_URL: "https://worker.test",
    OPENAI_API_KEY: "x",
    OPENAI_REALTIME_MODEL: "gpt-realtime-2",
    TWILIO_AUTH_TOKEN: "x",
    ...overrides,
  };
}

function makeState() {
  const waits: Promise<unknown>[] = [];
  return {
    waits,
    state: {
      waitUntil: (p: Promise<unknown>) => {
        waits.push(p);
      },
    } as any,
  };
}

async function setupSession(envOverrides: Partial<Env> = {}) {
  const env = makeEnv(envOverrides);
  const { state, waits } = makeState();
  const session = new CallSession(state, env as any);
  // The worker runtime accepts `webSocket: client` on Response; node throws on
  // status 101. Side effects (listener registration) happen first, so we can
  // safely swallow the RangeError and keep going.
  try {
    await session.fetch(new Request("http://test/twilio/stream"));
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
  }
  if (!lastPair) throw new Error("WebSocketPair not invoked");
  return { session, env, waits, server: lastPair.server, client: lastPair.client };
}

const startFrame = (callSid = "CA-test", streamSid = "MZ-test") =>
  JSON.stringify({ event: "start", start: { callSid, streamSid } });

const mediaFrame = (payload: string) =>
  JSON.stringify({ event: "media", media: { payload, track: "inbound", timestamp: "0" } });

const stopFrame = (callSid = "CA-test") =>
  JSON.stringify({ event: "stop", stop: { callSid } });

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("CallSession", () => {
  beforeEach(() => {
    geminis.length = 0;
    realtimes.length = 0;
    postCallCalls.length = 0;
    lastPair = null;
    control.connectShouldThrow = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens Gemini Live with the persona system prompt on the start frame", async () => {
    const { server, env } = await setupSession();
    server.dispatch("message", { data: startFrame() });
    await tick();

    expect(geminis).toHaveLength(1);
    const opts = geminis[0]!.opts;
    expect(opts.apiKey).toBe(env.GEMINI_API_KEY);
    expect(opts.model).toBe(env.GEMINI_LIVE_MODEL);
    expect(opts.systemPrompt.length).toBeGreaterThan(100);
    // Hard-guardrail boilerplate must be embedded in every persona prompt.
    expect(opts.systemPrompt.toLowerCase()).toContain("never");
  });

  it("notifies Convex that the call started (fire-and-forget)", async () => {
    const { server, waits } = await setupSession();
    server.dispatch("message", { data: startFrame("CA-abc") });
    await Promise.all(waits);

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://convex.test/ring0/call/started");
    const body = JSON.parse((init as any).body);
    expect(body.callSid).toBe("CA-abc");
    expect(body.personaId).toBe("confused-auntie");
    expect(typeof body.startedAt).toBe("number");
  });

  it("decodes inbound μ-law and forwards PCM16 to Gemini", async () => {
    const { server } = await setupSession();
    server.dispatch("message", { data: startFrame() });
    await tick();

    // Four μ-law bytes → 8 PCM16 samples (16-bit, 16 kHz upsampled).
    const ulaw = new Uint8Array([0x80, 0x00, 0x7f, 0xff]);
    server.dispatch("message", { data: mediaFrame(bytesToBase64(ulaw)) });

    expect(geminis[0]!.audioSent).toHaveLength(1);
    const pcm = new Int16Array(geminis[0]!.audioSent[0]!);
    expect(pcm.length).toBe(ulaw.length * 2);
  });

  it("ignores media frames that arrive before the start frame", async () => {
    const { server } = await setupSession();
    server.dispatch("message", {
      data: mediaFrame(bytesToBase64(new Uint8Array([0xff]))),
    });
    await tick();
    expect(geminis).toHaveLength(0);
  });

  it("ignores malformed Twilio JSON without crashing", async () => {
    const { server } = await setupSession();
    server.dispatch("message", { data: "not-json{" });
    server.dispatch("message", { data: 42 as any });
    expect(geminis).toHaveLength(0);
  });

  it("encodes Gemini PCM16 audio back to μ-law and sends it to Twilio with the streamSid", async () => {
    const { server } = await setupSession();
    server.dispatch("message", { data: startFrame("CA-1", "MZ-stream-id") });
    await tick();

    // 16 PCM16 samples at 16 kHz → 8 μ-law bytes at 8 kHz.
    const pcm = new Int16Array(16);
    for (let i = 0; i < pcm.length; i++) pcm[i] = i * 1000;
    geminis[0]!.opts.onAudio(pcm.buffer);

    expect(server.sent).toHaveLength(1);
    const frame = JSON.parse(server.sent[0]!);
    expect(frame.event).toBe("media");
    expect(frame.streamSid).toBe("MZ-stream-id");
    expect(typeof frame.media.payload).toBe("string");
    expect(base64ToBytes(frame.media.payload).length).toBe(pcm.length / 2);
  });

  it("buffers raw μ-law audio and dumps it to R2 plus the post-call queue on stop", async () => {
    const { server, env, waits } = await setupSession();
    server.dispatch("message", { data: startFrame("CA-9", "MZ-9") });
    await tick();

    const chunkA = new Uint8Array([1, 2, 3, 4]);
    const chunkB = new Uint8Array([5, 6, 7, 8]);
    server.dispatch("message", { data: mediaFrame(bytesToBase64(chunkA)) });
    server.dispatch("message", { data: mediaFrame(bytesToBase64(chunkB)) });

    geminis[0]!.opts.onTranscript("hello?", "agent");
    geminis[0]!.opts.onTranscript("this is the IRS", "user");

    server.dispatch("message", { data: stopFrame("CA-9") });
    await Promise.all(waits);

    expect(env.CALL_AUDIO.put).toHaveBeenCalledTimes(1);
    const [r2Key, r2Bytes] = env.CALL_AUDIO.put.mock.calls[0]!;
    expect(r2Key).toBe("raw/CA-9.ulaw");
    expect(Array.from(r2Bytes as Uint8Array)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(postCallCalls).toHaveLength(1);
    const job = postCallCalls[0]!.batch.messages[0].body;
    expect(job.callSid).toBe("CA-9");
    expect(job.personaId).toBe("confused-auntie");
    expect(job.audioKey).toBe("raw/CA-9.ulaw");
    expect(job.transcript).toEqual([
      { role: "agent", text: "hello?", t: expect.any(Number) },
      { role: "user", text: "this is the IRS", t: expect.any(Number) },
    ]);
    expect(typeof job.durationSec).toBe("number");
    expect(job.durationSec).toBeGreaterThanOrEqual(0);

    expect(geminis[0]!.closed).toBe(true);
  });

  it("dispatches post-call work when the Twilio socket closes (not just on stop)", async () => {
    const { server, env, waits } = await setupSession();
    server.dispatch("message", { data: startFrame() });
    await tick();
    server.close();
    await Promise.all(waits);

    expect(env.CALL_AUDIO.put).toHaveBeenCalledTimes(1);
    expect(postCallCalls).toHaveLength(1);
  });

  it("hangs up exactly once even if both stop and close fire", async () => {
    const { server, env, waits } = await setupSession();
    server.dispatch("message", { data: startFrame() });
    await tick();
    server.dispatch("message", { data: stopFrame() });
    server.close();
    await Promise.all(waits);

    expect(env.CALL_AUDIO.put).toHaveBeenCalledTimes(1);
    expect(postCallCalls).toHaveLength(1);
  });

  it("closes the Twilio socket when Gemini connect throws", async () => {
    control.connectShouldThrow = true;
    const { server } = await setupSession();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    server.dispatch("message", { data: startFrame() });
    await tick();
    expect(server.closed).toBe(true);
    errSpy.mockRestore();
  });

  it("hangs up the Twilio call when Gemini drops mid-call", async () => {
    const { server, waits } = await setupSession();
    server.dispatch("message", { data: startFrame() });
    await tick();
    geminis[0]!.opts.onClose();
    await Promise.all(waits);

    expect(server.closed).toBe(true);
    expect(postCallCalls).toHaveLength(1);
  });

  it("opens OpenAI Realtime instead of Gemini when VOICE_PROVIDER=openai-realtime", async () => {
    const { server, env } = await setupSession({ VOICE_PROVIDER: "openai-realtime" });
    server.dispatch("message", { data: startFrame() });
    await tick();

    expect(geminis).toHaveLength(0);
    expect(realtimes).toHaveLength(1);
    const opts = realtimes[0]!.opts;
    expect(opts.apiKey).toBe(env.OPENAI_API_KEY);
    expect(opts.model).toBe(env.OPENAI_REALTIME_MODEL);
    expect(opts.systemPrompt.length).toBeGreaterThan(100);
    expect(opts.systemPrompt.toLowerCase()).toContain("never");
  });

  it("routes Twilio media as 24 kHz PCM16 to the Realtime client", async () => {
    const { server } = await setupSession({ VOICE_PROVIDER: "openai-realtime" });
    server.dispatch("message", { data: startFrame() });
    await tick();

    // Four μ-law bytes → 12 PCM16 samples (3x upsample to 24 kHz).
    const ulaw = new Uint8Array([0x80, 0x00, 0x7f, 0xff]);
    server.dispatch("message", { data: mediaFrame(bytesToBase64(ulaw)) });

    expect(realtimes[0]!.audioSent).toHaveLength(1);
    const pcm = new Int16Array(realtimes[0]!.audioSent[0]!);
    expect(pcm.length).toBe(ulaw.length * 3);
  });

  it("survives a Convex notify failure without affecting the audio path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => "boom",
      })),
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { server, waits } = await setupSession();
    server.dispatch("message", { data: startFrame() });
    await tick();

    server.dispatch("message", {
      data: mediaFrame(bytesToBase64(new Uint8Array([0x7f, 0x80]))),
    });
    expect(geminis[0]!.audioSent).toHaveLength(1);

    await Promise.all(waits);
    errSpy.mockRestore();
  });
});

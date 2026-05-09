// CallSession holds the full lifecycle of one phone call:
//   • the Twilio Media Streams WebSocket (μ-law @ 8 kHz)
//   • the live voice WebSocket (Gemini Live @ 16 kHz PCM16, or OpenAI Realtime @ 24 kHz PCM16)
//   • per-call state: callSid, persona, partial transcript
//   • on hangup: dump audio to R2, fan out post-call jobs to the queue.

import { resolvePersona } from "@ring0/personas";
import type { PostCallJob } from "@ring0/pipeline";
import { muLaw8kToPcm16k, muLaw8kToPcm24k, pcm16kToMuLaw8k, pcm24kToMuLaw8k } from "./audio";
import { ConvexClient } from "./convex-client";
import { GeminiLive } from "./gemini";
import { handlePostCallBatch } from "./queue-consumer";
import { OpenAIRealtime } from "./realtime";
import type { Env } from "./index";
import { logError, logInfo } from "./logger";

type VoiceProvider = "gemini" | "openai-realtime";

interface VoiceClient {
  connect(): Promise<void>;
  sendAudio(pcm: ArrayBuffer): void;
  close(): void;
}

interface TwilioMessage {
  event: "connected" | "start" | "media" | "stop" | "mark";
  start?: { streamSid: string; callSid: string };
  media?: { payload: string; track: string; timestamp: string };
  stop?: { callSid: string };
}

export class CallSession implements DurableObject {
  private twilio: WebSocket | null = null;
  private voice: VoiceClient | null = null;
  private voiceProvider: VoiceProvider = "gemini";
  private streamSid: string | null = null;
  private callSid: string | null = null;
  private startedAt = 0;
  private transcript: { role: "user" | "agent"; text: string; t: number }[] = [];
  private rawAudio: Uint8Array[] = [];
  private firstAudioLogged = false;
  private firstTranscriptLogged = false;
  private transcriptFlushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    this.twilio = server;

    server.addEventListener("message", (ev) => this.onTwilioMessage(ev));
    server.addEventListener("close", () => this.onHangup());
    server.addEventListener("error", () => this.onHangup());

    return new Response(null, { status: 101, webSocket: client });
  }

  private async onTwilioMessage(ev: MessageEvent): Promise<void> {
    let msg: TwilioMessage;
    try {
      msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
    } catch {
      return;
    }

    switch (msg.event) {
      case "start": {
        this.streamSid = msg.start!.streamSid;
        this.callSid = msg.start!.callSid;
        this.startedAt = Date.now();
        logInfo({ callSid: this.callSid, step: "twilio.start", streamSid: this.streamSid, personaId: this.personaId });
        // Tell Convex the call is live — fire-and-forget so we never block
        // the audio path on a slow Convex round-trip.
        this.state.waitUntil(this.notifyCallStarted());
        await this.openVoice();
        break;
      }
      case "media": {
        if (!this.voice || !msg.media) return;
        // Buffer for R2 dump (we keep μ-law to save space).
        this.rawAudio.push(b64ToBytes(msg.media.payload));
        const pcm = this.voiceProvider === "openai-realtime"
          ? muLaw8kToPcm24k(msg.media.payload)
          : muLaw8kToPcm16k(msg.media.payload);
        this.voice.sendAudio(pcm);
        break;
      }
      case "stop": {
        this.onHangup();
        break;
      }
    }
  }

  // Throttle: at most one push per 300ms. Each new fragment that arrives
  // while a flush is pending is included in that pending flush, so the
  // dashboard sees the full running transcript within ~300ms of any word.
  private scheduleTranscriptFlush(): void {
    if (this.transcriptFlushTimer) return;
    if (!this.callSid) return;
    this.transcriptFlushTimer = setTimeout(() => {
      this.transcriptFlushTimer = null;
      if (!this.callSid) return;
      this.state.waitUntil(this.pushTranscript());
    }, 300);
  }

  private async pushTranscript(): Promise<void> {
    if (!this.callSid) return;
    const callSid = this.callSid;
    const turns = this.transcript.slice();
    const t0 = Date.now();
    try {
      await new ConvexClient(this.env.CONVEX_URL).post("/ring0/call/transcript", {
        callSid,
        transcript: turns,
      });
      logInfo({ callSid, step: "convex.transcript.ok", stepMs: Date.now() - t0, turns: turns.length });
    } catch (err) {
      logError({ callSid, step: "convex.transcript.err", stepMs: Date.now() - t0 }, err);
    }
  }

  private async notifyCallStarted(): Promise<void> {
    if (!this.callSid) return;
    const callSid = this.callSid;
    const t0 = Date.now();
    try {
      await new ConvexClient(this.env.CONVEX_URL).post("/ring0/call/started", {
        callSid,
        personaId: this.personaId,
        startedAt: this.startedAt,
      });
      logInfo({ callSid, step: "convex.callStarted.ok", stepMs: Date.now() - t0 });
    } catch (err) {
      logError({ callSid, step: "convex.callStarted.err", stepMs: Date.now() - t0 }, err);
    }
  }

  private personaId: import("@ring0/personas").PersonaId = "confused-auntie";

  private async openVoice(): Promise<void> {
    // For block 3 we hard-pick one persona. The persona registry will rotate
    // them as soon as KV is wired up.
    const persona = resolvePersona(this.personaId);
    this.voiceProvider = this.env.VOICE_PROVIDER === "openai-realtime" ? "openai-realtime" : "gemini";
    const tag = this.voiceProvider === "openai-realtime" ? "realtime" : "gemini";

    const onAudio = (pcm: ArrayBuffer) => {
      if (!this.firstAudioLogged) {
        this.firstAudioLogged = true;
        logInfo({ callSid: this.callSid ?? undefined, step: `${tag}.firstAudio`, totalMs: Date.now() - this.startedAt });
      }
      this.sendToTwilio(pcm);
    };
    const onTranscript = (text: string, role: "user" | "agent") => {
      const t = Date.now() - this.startedAt;
      this.transcript.push({ role, text, t });
      if (!this.firstTranscriptLogged) {
        this.firstTranscriptLogged = true;
        logInfo({ callSid: this.callSid ?? undefined, step: `${tag}.firstTranscript`, totalMs: t, role });
      }
      this.scheduleTranscriptFlush();
    };
    const onInterrupted = () => {
      // Caller barged in — drop everything Twilio has buffered for playback
      // so Ring0 stops mid-sentence instead of finishing its queued audio.
      logInfo({ callSid: this.callSid ?? undefined, step: `${tag}.interrupted`, totalMs: Date.now() - this.startedAt });
      this.clearTwilioAudio();
    };
    const onClose = () => {
      // If the upstream voice drops mid-call we just hang up — the post-call
      // pipeline will still get whatever transcript we accumulated.
      logInfo({ callSid: this.callSid ?? undefined, step: `${tag}.close`, totalMs: Date.now() - this.startedAt });
      this.twilio?.close();
    };

    this.voice = this.voiceProvider === "openai-realtime"
      ? new OpenAIRealtime({
          apiKey: this.env.OPENAI_API_KEY,
          model: this.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2",
          endpoint: this.env.OPENAI_REALTIME_URL,
          systemPrompt: persona.systemPrompt,
          onAudio,
          onTranscript,
          onInterrupted,
          onClose,
        })
      : new GeminiLive({
          apiKey: this.env.GEMINI_API_KEY,
          model: this.env.GEMINI_LIVE_MODEL,
          endpoint: this.env.GEMINI_LIVE_URL,
          systemPrompt: persona.systemPrompt,
          onAudio,
          onTranscript,
          onInterrupted,
          onClose,
        });

    const t0 = Date.now();
    try {
      await this.voice.connect();
      logInfo({ callSid: this.callSid ?? undefined, step: `${tag}.connect.ok`, stepMs: Date.now() - t0 });
    } catch (err) {
      logError({ callSid: this.callSid ?? undefined, step: `${tag}.connect.err`, stepMs: Date.now() - t0 }, err);
      this.twilio?.close();
    }
  }

  private clearTwilioAudio(): void {
    if (!this.twilio || !this.streamSid) return;
    this.twilio.send(
      JSON.stringify({ event: "clear", streamSid: this.streamSid }),
    );
  }

  private sendToTwilio(pcm: ArrayBuffer): void {
    if (!this.twilio || !this.streamSid) return;
    const payload = this.voiceProvider === "openai-realtime"
      ? pcm24kToMuLaw8k(pcm)
      : pcm16kToMuLaw8k(pcm);
    this.twilio.send(
      JSON.stringify({
        event: "media",
        streamSid: this.streamSid,
        media: { payload },
      }),
    );
  }

  private onHangup(): void {
    if (!this.callSid) return;
    const callSid = this.callSid;
    this.callSid = null;

    if (this.transcriptFlushTimer) {
      clearTimeout(this.transcriptFlushTimer);
      this.transcriptFlushTimer = null;
    }

    this.voice?.close();
    const durationSec = Math.round((Date.now() - this.startedAt) / 1000);
    const audio = concat(this.rawAudio);
    this.rawAudio = [];
    logInfo({
      callSid,
      step: "hangup",
      durationSec,
      audioBytes: audio.length,
      transcriptTurns: this.transcript.length,
    });

    // Don't await — let the DO finish handling the WS close.
    this.state.waitUntil(this.dispatchPostCall(callSid, durationSec, audio));
  }

  private async dispatchPostCall(callSid: string, durationSec: number, audio: Uint8Array): Promise<void> {
    const t0 = Date.now();
    try {
      await this.env.CALL_AUDIO.put(`raw/${callSid}.ulaw`, audio);
      const r2Ms = Date.now() - t0;
      const t1 = Date.now();
      const job: PostCallJob = {
        callSid,
        personaId: this.personaId,
        durationSec,
        transcript: this.transcript,
        audioKey: `raw/${callSid}.ulaw`,
      };
      // No Cloudflare Queue (Workers Paid only) — run the same consumer
      // inline. Synthetic single-message batch keeps the consumer's signature
      // stable so its tests cover this path 1:1.
      const batch = {
        messages: [{ id: callSid, body: job, timestamp: new Date(), attempts: 1, ack: () => {}, retry: () => {} }],
        ackAll: () => {},
        retryAll: () => {},
        queue: "inline",
      } as unknown as MessageBatch<PostCallJob>;
      await handlePostCallBatch(batch, this.env);
      logInfo({ callSid, step: "postCall.dispatched", r2Ms, pipelineMs: Date.now() - t1 });
    } catch (err) {
      logError({ callSid, step: "postCall.err", stepMs: Date.now() - t0 }, err);
    }
  }
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

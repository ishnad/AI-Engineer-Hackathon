// Thin wrapper over the OpenAI Realtime WebSocket. Mirrors GeminiLive's shape
// so CallSession can swap providers via VOICE_PROVIDER without touching the
// audio path.

import { base64ToBytes, bytesToBase64 } from "./audio";

export interface RealtimeOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  // Override for the local mock harness; falls back to the public Realtime WS.
  endpoint?: string;
  onAudio: (pcm24k: ArrayBuffer) => void;
  onTranscript: (text: string, role: "user" | "agent") => void;
  // Fires when server VAD detects the caller starting to speak so the
  // session can flush any audio still buffered at Twilio.
  onInterrupted?: () => void;
  onClose: () => void;
}

export class OpenAIRealtime {
  private ws: WebSocket | null = null;
  constructor(private opts: RealtimeOptions) {}

  async connect(): Promise<void> {
    const base = this.opts.endpoint ?? `wss://api.openai.com/v1/realtime`;
    const url = `${base}${base.includes("?") ? "&" : "?"}model=${encodeURIComponent(this.opts.model)}`;

    // CF Workers' WebSocket constructor can't set custom headers, so we use
    // the documented subprotocol auth path. Mock harness ignores subprotocols.
    const ws = new WebSocket(url, [
      "realtime",
      `openai-insecure-api-key.${this.opts.apiKey}`,
      "openai-beta.realtime-v1",
    ]);
    this.ws = ws;
    ws.addEventListener("message", (ev) => this.handleMessage(ev));
    ws.addEventListener("close", () => this.opts.onClose());

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", (e) => reject(e), { once: true });
    });

    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          instructions: this.opts.systemPrompt,
          voice: "alloy",
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: { model: "whisper-1" },
          turn_detection: { type: "server_vad" },
        },
      }),
    );
  }

  // Send a chunk of caller audio (PCM16 @ 24 kHz).
  sendAudio(pcm24k: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.READY_STATE_OPEN) return;
    const audio = bytesToBase64(new Uint8Array(pcm24k));
    this.ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
  }

  close(): void {
    this.ws?.close();
  }

  private handleMessage(ev: MessageEvent): void {
    let msg: any;
    try {
      msg = typeof ev.data === "string" ? JSON.parse(ev.data) : null;
    } catch {
      return;
    }
    if (!msg) return;

    switch (msg.type) {
      case "input_audio_buffer.speech_started":
        this.opts.onInterrupted?.();
        break;
      case "response.audio.delta":
        if (typeof msg.delta === "string") {
          const bytes = base64ToBytes(msg.delta);
          const ab = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(ab).set(bytes);
          this.opts.onAudio(ab);
        }
        break;
      case "response.audio_transcript.done":
        if (typeof msg.transcript === "string") {
          this.opts.onTranscript(msg.transcript, "agent");
        }
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (typeof msg.transcript === "string") {
          this.opts.onTranscript(msg.transcript, "user");
        }
        break;
    }
  }
}

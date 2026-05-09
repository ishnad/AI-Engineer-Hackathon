// Thin wrapper over the Gemini Live WebSocket. The real endpoint and message
// shapes evolve fast — keep the surface small so it's easy to swap.

import { logInfo } from "./logger";

export interface GeminiLiveOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  // Override for the local mock harness; falls back to the public Gemini WS.
  endpoint?: string;
  onAudio: (pcm16k: ArrayBuffer) => void;
  onTranscript: (text: string, role: "user" | "agent") => void;
  onClose: () => void;
}

export class GeminiLive {
  private ws: WebSocket | null = null;
  constructor(private opts: GeminiLiveOptions) {}

  async connect(): Promise<void> {
    const base =
      this.opts.endpoint ??
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`;
    const url = `${base}${base.includes("?") ? "&" : "?"}key=${encodeURIComponent(this.opts.apiKey)}`;

    const ws = new WebSocket(url);
    this.ws = ws;
    ws.addEventListener("message", (ev) => this.handleMessage(ev));
    ws.addEventListener("close", (ev) => {
      const ce = ev as CloseEvent;
      logInfo({ step: "gemini.close.detail", code: ce.code, reason: ce.reason });
      this.opts.onClose();
    });

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", (e) => reject(e), { once: true });
    });

    // Initial setup frame: model + persona system prompt + audio output.
    ws.send(
      JSON.stringify({
        setup: {
          model: `models/${this.opts.model}`,
          systemInstruction: { parts: [{ text: this.opts.systemPrompt }] },
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      }),
    );
  }

  // Send a chunk of caller audio (PCM16 @ 16 kHz).
  sendAudio(pcm16k: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.READY_STATE_OPEN) return;
    if (!this.setupComplete) {
      this.pendingAudio.push(pcm16k);
      return;
    }
    const b64 = arrayBufferToBase64(pcm16k);
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: { mimeType: "audio/pcm;rate=16000", data: b64 },
        },
      }),
    );
  }

  close(): void {
    this.ws?.close();
  }

  private setupComplete = false;
  private pendingAudio: ArrayBuffer[] = [];

  private async handleMessage(ev: MessageEvent): Promise<void> {
    let raw: string | null = null;
    if (typeof ev.data === "string") {
      raw = ev.data;
    } else if (ev.data instanceof ArrayBuffer) {
      raw = new TextDecoder().decode(ev.data);
      logInfo({ step: "gemini.frame", kind: "arraybuffer", bytes: ev.data.byteLength });
    } else if (ev.data && typeof (ev.data as Blob).arrayBuffer === "function") {
      const buf = await (ev.data as Blob).arrayBuffer();
      raw = new TextDecoder().decode(buf);
      logInfo({ step: "gemini.frame", kind: "blob", bytes: buf.byteLength });
    } else {
      logInfo({ step: "gemini.frame", kind: typeof ev.data });
      return;
    }

    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      logInfo({ step: "gemini.frame.unparsable", preview: raw.slice(0, 200) });
      return;
    }
    if (!msg) return;

    logInfo({ step: "gemini.msg", keys: Object.keys(msg).join(","), serverKeys: msg.serverContent ? Object.keys(msg.serverContent).join(",") : undefined });

    if (msg.setupComplete) {
      this.setupComplete = true;
      const drained = this.pendingAudio;
      this.pendingAudio = [];
      for (const buf of drained) this.sendAudio(buf);
      return;
    }

    const userText = msg?.serverContent?.inputTranscription?.text;
    if (userText) this.opts.onTranscript(userText, "user");

    const parts = msg?.serverContent?.modelTurn?.parts as Array<any> | undefined;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
          this.opts.onAudio(base64ToArrayBuffer(part.inlineData.data));
        } else if (part.text) {
          this.opts.onTranscript(part.text, "agent");
        }
      }
    }
    const agentText = msg?.serverContent?.outputTranscription?.text;
    if (agentText) this.opts.onTranscript(agentText, "agent");
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

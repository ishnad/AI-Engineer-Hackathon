// Ring0 — Cloudflare Worker entrypoint.
// Two HTTP routes drive the call loop:
//   POST /twilio/incoming  → returns TwiML that asks Twilio to stream audio.
//   GET  /twilio/stream    → upgrades to WS and forwards audio into a CallSession DO.

import { CallSession } from "./call-session";
import { logInfo } from "./logger";
import { incomingTwiml } from "./twiml";

export { CallSession };

export interface Env {
  CALL_SESSION: DurableObjectNamespace;
  CALL_AUDIO: R2Bucket;
  PERSONAS: KVNamespace;
  SIGNATURES: VectorizeIndex;
  GEMINI_API_KEY: string;
  GEMINI_LIVE_MODEL: string;
  // "gemini" (default) or "openai-realtime". Selects the live voice agent.
  VOICE_PROVIDER?: string;
  OPENAI_REALTIME_MODEL?: string;
  // Optional overrides used by the local mock harness (scripts/mock/*).
  GEMINI_LIVE_URL?: string;
  OPENAI_REALTIME_URL?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_API_KEY: string;
  TWILIO_AUTH_TOKEN: string;
  CONVEX_URL: string;
  PUBLIC_WORKER_URL: string;
  // Telegram bot for post-call summary DMs (single-user demo).
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  // Public URL of the Vercel dashboard, used to link the Telegram summary
  // to the per-call transcript page (e.g. https://ring0.vercel.app).
  DASHBOARD_URL?: string;
  // Set to "1" to dry-run the meta-agent (logs the persona-author prompt
  // instead of calling GPT-5.5).
  RING0_META_DRYRUN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/twilio/incoming" && request.method === "POST") {
      // Twilio hits this on every inbound call. We respond with TwiML that
      // points back at our /twilio/stream WebSocket.
      const form = await request.clone().formData().catch(() => null);
      logInfo({
        step: "twilio.incoming",
        callSid: form?.get("CallSid")?.toString(),
        from: form?.get("From")?.toString(),
        to: form?.get("To")?.toString(),
        forwardedFrom: form?.get("ForwardedFrom")?.toString() || undefined,
      });
      const wsUrl = env.PUBLIC_WORKER_URL.replace(/^http/, "ws") + "/twilio/stream";
      const fromPhone = form?.get("From")?.toString() || undefined;
      return new Response(incomingTwiml(wsUrl, fromPhone), {
        headers: { "content-type": "text/xml" },
      });
    }

    if (url.pathname === "/twilio/stream") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      // One Durable Object per call. CallSid arrives in the first Twilio
      // "start" frame, so we mint a transient ID up front and rebind once we
      // know the real CallSid.
      const id = env.CALL_SESSION.newUniqueId();
      const stub = env.CALL_SESSION.get(id);
      return stub.fetch(request);
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    return new Response("ring0", { status: 200 });
  },
} satisfies ExportedHandler<Env>;

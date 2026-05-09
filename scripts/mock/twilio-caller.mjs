// Fake Twilio Media Streams client.
//
// Connects to the Worker's /twilio/stream WebSocket and replays the frame
// sequence Twilio actually sends — start, periodic μ-law media, stop —
// so the Worker drives a full call without any Twilio account.
//
// Defaults assume `wrangler dev` on 8787:
//   WORKER_WS_URL=ws://127.0.0.1:8787/twilio/stream node scripts/mock/twilio-caller.mjs

import WebSocket from "ws";

const URL = process.env.WORKER_WS_URL ?? "ws://127.0.0.1:8787/twilio/stream";
const CALL_DURATION_MS = Number(process.env.MOCK_CALL_MS ?? 30_000);
const FRAME_INTERVAL_MS = 20; // Twilio sends a 20 ms μ-law frame.
const SAMPLES_PER_FRAME = 160; // 8 kHz × 0.020 s

// One frame of μ-law silence (0xff) — the audio content doesn't matter
// for the mock-Gemini pipeline, but we send realistic shapes anyway.
const SILENT_FRAME_B64 = Buffer.alloc(SAMPLES_PER_FRAME, 0xff).toString("base64");

const callSid = `CA-mock-${Date.now()}`;
const streamSid = `MZ-mock-${Date.now()}`;

console.log(`[mock-twilio] dialing ${URL} (callSid=${callSid})`);

const ws = new WebSocket(URL);

ws.on("open", () => {
  ws.send(JSON.stringify({ event: "connected", protocol: "Call", version: "1.0.0" }));
  ws.send(JSON.stringify({ event: "start", start: { streamSid, callSid } }));

  let elapsed = 0;
  const tick = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) { clearInterval(tick); return; }
    ws.send(JSON.stringify({
      event: "media",
      streamSid,
      media: { payload: SILENT_FRAME_B64, track: "inbound", timestamp: String(elapsed) },
    }));
    elapsed += FRAME_INTERVAL_MS;
    if (elapsed >= CALL_DURATION_MS) {
      clearInterval(tick);
      ws.send(JSON.stringify({ event: "stop", stop: { callSid } }));
      setTimeout(() => ws.close(), 200);
    }
  }, FRAME_INTERVAL_MS);
});

ws.on("message", (raw) => {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }
  if (msg.event === "media") {
    // The Worker is replying with μ-law audio for Twilio to play.
    // Just count the frames so the operator sees something happening.
    framesIn++;
  }
});

let framesIn = 0;
const heartbeat = setInterval(() => {
  console.log(`[mock-twilio] inbound frames from worker: ${framesIn}`);
}, 5000);

ws.on("close", () => {
  clearInterval(heartbeat);
  console.log(`[mock-twilio] call ended (received ${framesIn} agent frames)`);
});

ws.on("error", (err) => {
  console.error("[mock-twilio]", err.message);
  process.exit(1);
});

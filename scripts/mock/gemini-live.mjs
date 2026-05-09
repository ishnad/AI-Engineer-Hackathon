// Fake Gemini Live WebSocket server.
//
// Mimics the subset of `BidiGenerateContent` that worker/src/gemini.ts uses:
//   • accepts a {setup: ...} frame
//   • accepts {realtimeInput: {mediaChunks}} frames containing 16 kHz PCM16
//   • streams back {serverContent: {modelTurn: {parts: [{inlineData|text}]}}}
//   • emits {serverContent: {inputTranscription: {text}}} for caller turns
//
// Point the Worker at it via:  GEMINI_LIVE_URL=ws://127.0.0.1:8765
// (the worker still appends ?key=… — we ignore the key here.)

import { WebSocketServer } from "ws";

const PORT = Number(process.env.MOCK_GEMINI_PORT ?? 8765);

const SCRIPT = [
  { delay: 600,  role: "agent", text: "Hello? ... Oh, hello dear, who did you say you were with?" },
  { delay: 4500, role: "user",  text: "Ma'am, this is the IRS. There is a warrant for your arrest." },
  { delay: 2200, role: "agent", text: "The IRS? Goodness me. Hold on, let me find my reading glasses." },
  { delay: 4000, role: "user",  text: "You owe four thousand eight hundred dollars in back taxes." },
  { delay: 2500, role: "agent", text: "Four thousand? My nephew has an Apple. Could you spell your last name?" },
  { delay: 4000, role: "user",  text: "I am Officer Johnson. J-O-H-N-S-O-N. Stay on the line." },
  { delay: 2500, role: "agent", text: "Officer Johnson, that's a lovely name. Are you from Cleveland?" },
];

// 320-sample (20 ms) silent PCM16 chunk @ 16 kHz, base64-encoded.
const SILENT_PCM_B64 = Buffer.alloc(640).toString("base64");

const wss = new WebSocketServer({ port: PORT });
console.log(`[mock-gemini] listening on ws://127.0.0.1:${PORT}`);

wss.on("connection", (ws) => {
  console.log("[mock-gemini] client connected");
  let scripted = false;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.setup) {
      console.log("[mock-gemini] setup received:", msg.setup.model);
      if (!scripted) { scripted = true; runScript(ws); }
    }
    // We just discard realtimeInput audio — the worker only cares that we
    // stream something back.
  });

  ws.on("close", () => console.log("[mock-gemini] client closed"));
});

async function runScript(ws) {
  let total = 0;
  for (const turn of SCRIPT) {
    total += turn.delay;
    setTimeout(() => {
      if (ws.readyState !== ws.OPEN) return;
      if (turn.role === "user") {
        ws.send(JSON.stringify({
          serverContent: { inputTranscription: { text: turn.text } },
        }));
      } else {
        // Text first (so the dashboard transcript is readable),
        // then a placeholder audio chunk so the worker exercises the
        // PCM16 → μ-law path.
        ws.send(JSON.stringify({
          serverContent: { modelTurn: { parts: [{ text: turn.text }] } },
        }));
        ws.send(JSON.stringify({
          serverContent: {
            modelTurn: {
              parts: [{ inlineData: { mimeType: "audio/pcm;rate=16000", data: SILENT_PCM_B64 } }],
            },
          },
        }));
      }
    }, total);
  }
}

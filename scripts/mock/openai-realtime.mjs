// Fake OpenAI Realtime WebSocket server.
//
// Mimics the subset of the Realtime API that worker/src/realtime.ts uses:
//   • accepts a {type: "session.update"} frame
//   • accepts {type: "input_audio_buffer.append", audio} frames (PCM16 @ 24 kHz)
//   • streams back {type: "response.audio.delta", delta: <b64 pcm24k>} chunks
//   • emits {type: "response.audio_transcript.done", transcript} for agent turns
//   • emits {type: "conversation.item.input_audio_transcription.completed", transcript}
//     for caller turns
//
// Point the Worker at it via:  OPENAI_REALTIME_URL=ws://127.0.0.1:8767
//                              VOICE_PROVIDER=openai-realtime
// (the worker still appends ?model=… — we ignore it here.)

import { WebSocketServer } from "ws";

const PORT = Number(process.env.MOCK_REALTIME_PORT ?? 8767);

const SCRIPT = [
  { delay: 600,  role: "agent", text: "Hello? ... Oh, hello dear, who did you say you were with?" },
  { delay: 4500, role: "user",  text: "Ma'am, this is the IRS. There is a warrant for your arrest." },
  { delay: 2200, role: "agent", text: "The IRS? Goodness me. Hold on, let me find my reading glasses." },
  { delay: 4000, role: "user",  text: "You owe four thousand eight hundred dollars in back taxes." },
  { delay: 2500, role: "agent", text: "Four thousand? My nephew has an Apple. Could you spell your last name?" },
  { delay: 4000, role: "user",  text: "I am Officer Johnson. J-O-H-N-S-O-N. Stay on the line." },
  { delay: 2500, role: "agent", text: "Officer Johnson, that's a lovely name. Are you from Cleveland?" },
];

// 480-sample (20 ms) silent PCM16 chunk @ 24 kHz, base64-encoded.
const SILENT_PCM_B64 = Buffer.alloc(960).toString("base64");

const wss = new WebSocketServer({ port: PORT });
console.log(`[mock-realtime] listening on ws://127.0.0.1:${PORT}`);

wss.on("connection", (ws) => {
  console.log("[mock-realtime] client connected");
  let scripted = false;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === "session.update") {
      console.log("[mock-realtime] session.update received");
      if (!scripted) { scripted = true; runScript(ws); }
    }
    // We just discard input_audio_buffer.append — the worker only cares that
    // we stream something back.
  });

  ws.on("close", () => console.log("[mock-realtime] client closed"));
});

async function runScript(ws) {
  let total = 0;
  for (const turn of SCRIPT) {
    total += turn.delay;
    setTimeout(() => {
      if (ws.readyState !== ws.OPEN) return;
      if (turn.role === "user") {
        ws.send(JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: turn.text,
        }));
      } else {
        ws.send(JSON.stringify({
          type: "response.audio.delta",
          delta: SILENT_PCM_B64,
        }));
        ws.send(JSON.stringify({
          type: "response.audio_transcript.done",
          transcript: turn.text,
        }));
      }
    }, total);
  }
}

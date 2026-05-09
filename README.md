# Ring0 — The AI Cold-Call Killer

> *"We don't block scammers. We answer them."*

Hackathon MVP. Full spec in [docs/PRD.md](docs/PRD.md).

## Layout

| Path                                | PRD blocks | What it is                                                                |
|-------------------------------------|------------|---------------------------------------------------------------------------|
| [worker/](worker/)                  | 1–4, 5     | CF Worker. Twilio Stream ↔ Gemini Live in a Durable Object. Queue producer + consumer. |
| [personas/](personas/)              | 3, 10, 11  | Typed persona registry. Every prompt embeds the stalling toolkit + hard guardrails.    |
| [pipeline/](pipeline/)              | 6–8, 10–12 | GPT-5.5 extraction agent, persona tuner, meta-agent + GPT Image 2 posters and weekly recap hero. |
| [dashboard/](dashboard/)            | 9, 12      | Next.js + Convex reactive UI. HTTP routes for the Worker. Weekly recap cron.            |
| [infrastructure/](infrastructure/)  | 0          | Wrangler bootstrap, Twilio config, Convex provisioning.                                  |
| [scripts/](scripts/)                | demo       | Demo-day replay script (PRD §13 risk mitigation).                                        |

## Build state

Every integration the runtime touches is wired. Originally-speculative tracks
(Lyria hold-music, Veo 3 recap, Adaption Labs persona tuning, Cursor SDK
meta-agent) have been **swapped to OpenAI fallbacks** that read keys we
already have:

| Integration                                                 | Status   | Notes                                                                                         |
|-------------------------------------------------------------|----------|------------------------------------------------------------------------------------------------|
| Twilio, Gemini Live, OpenAI (GPT-5.5 + GPT Image 2), Convex, Cloudflare, Vercel | **Wired** | End-to-end runnable (with mocks via `npm run mock:all`).                                       |
| ~~Lyria hold-music~~                                        | **Removed** | The persona's stalling toolkit is the hold-music. No separate music track.                    |
| ~~Veo 3 weekly recap~~ → GPT-5.5 markdown + GPT Image 2 poster | **Wired**   | Convex weekly cron renders into `liveStats.weeklyRecap{Markdown,PosterUrl}`.                    |
| ~~Adaption Labs persona tuning~~ → GPT-5.5 self-tuner       | **Wired**   | Same every-5-calls cadence, OpenAI-only ([pipeline/src/adaption.ts](pipeline/src/adaption.ts)). |
| ~~Cursor SDK + GitHub PR~~ → GPT-5.5 proposed-persona table | **Wired**   | Meta-agent writes to `proposedPersonas`; dashboard renders. No GitHub automation.               |
| ~~Fal TTS, ElevenLabs~~                                     | **Removed** | Out of scope.                                                                                  |

See [.env.example](.env.example) for the authoritative key list.

## Getting started

1. `cp .env.example .env` and fill in keys.
2. Follow [infrastructure/README.md](infrastructure/README.md) — Wrangler bootstrap (KV/R2/Vectorize/Queue).
3. `npm install` from repo root (npm workspaces).
4. `npx convex dev` from `dashboard/` — generates `convex/_generated/` and starts the local Convex backend.
5. `npm run dev:worker` — Wrangler dev for the Worker.
6. `npm run dev:dashboard` — Next.js on `localhost:3000`.

## Demo-day replay

If no live scam dials in during the pitch, run:

```bash
CONVEX_URL=https://<deployment>.convex.cloud npm run demo:replay
# or one variant at a time:
node scripts/replay-call.mjs tech-support
node scripts/replay-call.mjs --list   # irs-impersonation, tech-support, romance, package-delivery, investment-fraud
```

It POSTs the same payloads the Worker would, so the dashboard fills with
plausible calls (transcript, signature, poster, proposed persona) —
exercising every poster style in [pipeline/src/poster.ts](pipeline/src/poster.ts)
— without touching Twilio/Gemini/OpenAI.

## Tests

```bash
npm test           # vitest run — covers audio, extract, poster, meta-agent, queue-consumer, call-session
npm run test:watch
```

## Local mock harness (no API keys)

`scripts/mock/` stands in for Twilio, Gemini Live, and OpenAI so the Worker
runs end-to-end with `wrangler dev` and zero credentials. Three terminals:

```bash
# 1. fake Gemini Live WS + fake OpenAI HTTP
npm run mock:all

# 2. Worker with mock endpoints (copy worker/.dev.vars.example → worker/.dev.vars)
npm run dev:worker

# 3. fake Twilio caller — drives the full call lifecycle
npm run mock:caller
```

The Worker reads `GEMINI_LIVE_URL` and `OPENAI_BASE_URL` from `.dev.vars` and
falls back to the public endpoints when they're unset, so the same code path
runs against real keys later.

## End-to-end flow

```
Twilio inbound  →  /twilio/incoming (TwiML <Stream>)
              →  /twilio/stream (WebSocket upgrade)
              →  CallSession Durable Object
                  • μ-law 8kHz ↔ PCM16 16kHz conversion
                  • Gemini Live WS bridge
                  • notify Convex /ring0/call/started
              →  on hangup: dump audio to R2, send to ring0-post-call queue

Queue consumer  →  GPT-5.5 extraction agent      → Convex /ring0/signature
              →  Vectorize upsert                 → cluster signatures
              →  GPT Image 2 poster               → Convex /ring0/poster
              →  GPT-5.5 persona tuner (every 5)  → Convex /ring0/persona/refined
              →  GPT-5.5 meta-agent               → Convex /ring0/proposed-persona
              →  pipeline latency ms              → Convex /ring0/pipeline-stats

Convex weekly cron  →  GPT-5.5 markdown + GPT Image 2 hero poster
                  →  liveStats.weeklyRecapMarkdown + weeklyRecapPosterUrl
                  →  dashboard renders the recap section
```

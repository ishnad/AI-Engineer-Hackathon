# Ring0 — The AI Cold-Call Killer

> *"We don't block scammers. We answer them — and turn every call into a weapon against them."*

Ring0 is a phone-number-as-a-service that intercepts spam, scam, and unsolicited
sales calls, answers them with a real-time AI voice persona, keeps the caller
engaged long enough to extract their script, and contributes the resulting
"scam signature" to a live, public threat-intelligence feed.

The global phone-fraud economy clears **$1T+ per year**. Ring0 flips the
asymmetry: every minute a scammer wastes on our AI is a minute they aren't
defrauding a real person.

Full spec: [docs/PRD.md](docs/PRD.md). Build state and migration notes:
[docs/CONTINUE.md](docs/CONTINUE.md).

---

## What Ring0 actually does (the AI features)

Ring0 is a pipeline of cooperating AI agents. Each one has a job, and together
they turn an unwanted phone call into structured intelligence.

### 1. Live voice persona — sub-second turn latency

When a scammer dials in, a Cloudflare Durable Object spins up a `CallSession`,
upgrades the Twilio media stream to a WebSocket, and bridges it to a
**real-time multimodal voice model** (Gemini Live by default, OpenAI Realtime
as a hot-swap fallback — controlled by `VOICE_PROVIDER` with no redeploy).

The persona is the product. Each one is a typed prompt object embedding a
**stalling toolkit** — patterns that buy time without revealing useful
information:

- *Confused Auntie* — keeps misunderstanding the pitch
- *Curious Teen* — asks endless follow-up questions
- *Distracted Dad* — wanders off-topic mid-sentence
- *Suspicious Auntie* — pushes back on every claim

Hard guardrails are baked into every persona prompt: never give numbers,
addresses, or codes. Live in [personas/src/](personas/src/).

**Target**: <800ms end-to-end voice turn, ≥60s sustained conversation per
call.

### 2. Post-call extraction agent — tool-calling LLM

When the caller hangs up, the recorded audio is dropped to R2 and the call is
queued. A queue consumer fires up a **GPT-5.5 extraction agent** that uses
tool-calling to pull a structured *scam signature* out of the transcript:
category, claimed organization, pressure tactics, payment rails requested,
red-flag phrases, a one-line script summary.

The signature is upserted into a vector index so semantically-similar calls
cluster together — the dashboard renders these as recurring scam families.
See [pipeline/src/extract.ts](pipeline/src/extract.ts).

### 3. AI-generated "Most Wanted" posters

For every call, a second model generates a stylized **Most Wanted poster**
from the extracted signature — different visual treatments per scam category
(IRS impersonation, tech-support, romance, package-delivery, investment).
Posters are written to R2 and surfaced reactively in the dashboard.
See [pipeline/src/poster.ts](pipeline/src/poster.ts).

### 4. Self-tuning persona loop

Every five completed calls, an **adaption agent** reviews recent transcripts
and proposes targeted edits to the persona prompts that under-performed
(short calls, low extraction quality). The tuner reasons over what worked,
what stalled out early, and rewrites the relevant section of the prompt.
Cadence and prompt logic in [pipeline/src/adaption.ts](pipeline/src/adaption.ts).

### 5. Meta-agent — AI that authors new AI personas

A separate **meta-agent** watches the signature stream and proposes entirely
new personas when it spots scam patterns the existing roster handles poorly.
Output is written to a `proposedPersonas` Convex table and rendered live in
the dashboard for human approval — no code-gen, no PR automation, just
proposals reviewed in the UI. See [pipeline/src/meta-agent.ts](pipeline/src/meta-agent.ts).
Set `RING0_META_DRYRUN=1` to log the prompt without spending tokens.

### 6. Weekly AI recap — markdown + hero poster

A scheduled Convex cron compiles the week's signatures into a
**GPT-generated markdown recap** plus a **hero poster** summarizing the top
trending scams. The dashboard renders both. See
[pipeline/src/veo-recap.ts](pipeline/src/veo-recap.ts) and
[dashboard/convex/weeklyRecap.ts](dashboard/convex/weeklyRecap.ts).

### 7. Telegram post-call summary

When a call ends, a compact summary plus a "View full transcript" deep-link
is DM'd to the operator via Telegram — useful during the demo for showing
the pipeline ran without staring at the dashboard.
See [worker/src/telegram.ts](worker/src/telegram.ts).

---

## End-to-end flow

```
Twilio inbound  →  /twilio/incoming   (TwiML <Stream>)
              →  /twilio/stream      (WebSocket upgrade)
              →  CallSession Durable Object
                  • μ-law 8kHz ↔ PCM16 16kHz conversion
                  • live voice model bridge (Gemini Live | OpenAI Realtime)
                  • notify Convex /ring0/call/started
              →  on hangup: dump audio to R2 → enqueue post-call job

Queue consumer  →  extraction agent (tool-calling)   → Convex /ring0/signature
              →  Vectorize upsert + clustering
              →  Most Wanted poster generation       → Convex /ring0/poster
              →  persona tuner   (every 5 calls)     → Convex /ring0/persona/refined
              →  meta-agent      (proposed personas) → Convex /ring0/proposed-persona
              →  pipeline latency telemetry          → Convex /ring0/pipeline-stats
              →  Telegram post-call DM

Convex weekly cron → markdown recap + hero poster → liveStats.weeklyRecap*
                  → dashboard renders the recap section
```

---

## Project layout

| Path                                | What's inside                                                                                          |
|-------------------------------------|--------------------------------------------------------------------------------------------------------|
| [worker/](worker/)                  | Cloudflare Worker. Twilio Stream ↔ live voice model bridge in a Durable Object. Queue producer + consumer. Telegram client. |
| [personas/](personas/)              | Typed persona registry. Every prompt embeds the stalling toolkit + hard guardrails.                    |
| [pipeline/](pipeline/)              | Extraction agent, persona tuner, meta-agent, poster generator, weekly recap.                            |
| [dashboard/](dashboard/)            | Next.js + Convex reactive UI. HTTP routes called by the Worker. Weekly recap cron.                      |
| [infrastructure/](infrastructure/)  | Wrangler bootstrap, Twilio config, Convex provisioning notes.                                           |
| [scripts/](scripts/)                | Demo-day replay script + zero-key local mock harness (Twilio, Gemini, OpenAI).                          |
| [docs/](docs/)                      | PRD + ongoing build journal.                                                                            |

---

## Getting started

```bash
cp .env.example .env                       # fill in keys
npm install                                # npm workspaces — installs everything
npx convex dev --cwd dashboard             # generates dashboard/convex/_generated/
npm run dev:worker                         # Wrangler dev for the Cloudflare Worker
npm run dev:dashboard                      # Next.js on localhost:3000
```

Wrangler bindings (KV, R2, Vectorize, Queues) are bootstrapped from
[infrastructure/README.md](infrastructure/README.md).

### Voice provider hot-swap

The voice agent is provider-agnostic at the prompt layer. Flip
`VOICE_PROVIDER=gemini` ↔ `VOICE_PROVIDER=openai-realtime` in the Worker env
and the same persona prompt drives a different upstream model — useful for
side-by-side latency comparisons during the demo.

---

## Local mock harness — runs end-to-end with zero API keys

`scripts/mock/` stands in for Twilio, the live voice WebSocket, and the
post-call HTTP APIs. The Worker reads `GEMINI_LIVE_URL` / `OPENAI_BASE_URL`
from `worker/.dev.vars` and falls back to the public endpoints when unset, so
the same code path runs against real keys later.

Three terminals:

```bash
npm run mock:all       # fake voice WS + fake post-call HTTP
npm run dev:worker     # Worker pointing at the mocks
npm run mock:caller    # synthetic Twilio caller — drives the full lifecycle
```

---

## Demo-day replay (the safety net)

If no live scam dials in during the pitch, replay seeded calls into Convex —
the dashboard fills with plausible transcripts, signatures, posters, and
proposed personas, exercising every poster style:

```bash
CONVEX_URL=https://<deployment>.convex.cloud npm run demo:replay

# or one variant at a time:
node scripts/replay-call.mjs tech-support
node scripts/replay-call.mjs --list
#   irs-impersonation, tech-support, romance, package-delivery, investment-fraud
```

---

## Tests

```bash
npm test           # vitest — covers audio, extract, poster, meta-agent,
                   # queue-consumer, call-session
npm run test:watch
npm run typecheck  # all workspaces
```

---

## Tech stack

Ring0 leans on the AI-Engineer hackathon sponsor stack and ships everything
the runtime needs without speculative dependencies.

- **Voice agent** — Gemini Live (`flash-3.1-live`), with OpenAI Realtime as a
  configurable fallback driven by the same persona prompt.
- **Post-call reasoning** — OpenAI GPT-5.5 powers the extraction agent, the
  persona tuner, the meta-agent, and the weekly recap markdown.
- **Generative imagery** — OpenAI GPT Image 2 renders Most Wanted posters and
  the weekly recap hero.
- **Edge runtime** — Cloudflare Workers with Durable Objects (call state),
  R2 (audio), KV (config), Queues (post-call jobs), Vectorize (signature
  index).
- **Reactive backend** — Convex for live queries, scheduled crons, and the
  HTTP routes the Worker calls into.
- **Telephony** — Twilio Programmable Voice + Media Streams.
- **Hosting** — Vercel for the Next.js dashboard.
- **Operator notifications** — Telegram Bot API for post-call DMs.

Authoritative key list lives in [.env.example](.env.example).

---

## Build state

The original PRD targeted a longer sponsor list. Several integrations were
swapped for OpenAI-only fallbacks during the build to keep latency predictable
and the dependency surface small. Don't reintroduce them:

| Original                          | What runs now                                                                                |
|-----------------------------------|----------------------------------------------------------------------------------------------|
| Lyria hold-music                  | **Removed.** The persona's stalling toolkit *is* the hold-music.                              |
| Veo 3 weekly recap                | Replaced by GPT-5.5 markdown + GPT Image 2 hero poster on the same Convex weekly cron.        |
| Adaption Labs persona tuner       | Replaced by a GPT-5.5 self-tuner. Same every-5-calls cadence.                                 |
| Cursor SDK + GitHub PR meta-agent | Replaced by a `proposedPersonas` Convex table the dashboard renders. No GitHub automation.    |
| Fal TTS, ElevenLabs               | **Removed.** Out of scope.                                                                    |

---

## Constraints we held the build to

- **Latency**: <800ms end-to-end voice turn.
- **Demo target**: ≥60s sustained conversation per call.
- **Safety**: personas never produce numbers, addresses, or one-time codes,
  even under social-engineering pressure.

---

## License & credits

Hackathon project — built in a 7-hour window for the AI-Engineer Hackathon.
Questions, edge cases, or persona ideas welcome.

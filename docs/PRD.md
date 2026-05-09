# Product Requirements Document (PRD)
## Ring0 — The AI Cold-Call Killer

**Version:** 1.1 (Hackathon MVP — Sponsor-Aligned)
**Author:** Hackathon Team
**Build window:** 7 hours (per AIE Hack format)
**Doc status:** Final for build kickoff

---

## 1. Executive Summary

**Ring0** is a phone-number-as-a-service that intercepts spam, scam, and unsolicited
sales calls, answers them with a real-time AI voice persona, keeps the caller engaged
long enough to extract their script, and contributes the resulting "scam signature" to
a public, realtime threat-intelligence dashboard.

Built end-to-end on the AIE Hack sponsor stack: **Gemini flash-3.1-live** for the live
voice agent, **GPT-5.5** for post-call reasoning, **GPT Image 2** for "Most Wanted"
posters, **Veo 3 + Lyria** for weekly recaps and on-hold music, **Cloudflare Workers
/ Durable Objects / R2 / Vectorize** for the telephony + state + signature index,
**Convex** for the reactive dashboard, **Adaption Labs** for the persona-tuning loop,
**Fal** for parallel TTS personas, **ElevenLabs** for accent variety, **Cursor SDK**
for the meta-agent that authors new personas, all shipped on **Vercel** from a
**Daytona** dev environment.

In a world where the global scam economy exceeds **$1 trillion annually**, Ring0 flips
the asymmetry: every wasted scammer-minute is a minute not spent defrauding a real
person.

**One-liner:** *"We don't block scammers. We answer them — and turn every call into a
weapon against them."*

---

## 1.1 Current build state (read this before §6)

The PRD body below still describes the **original target architecture**. The
runtime has since been simplified — six sponsor integrations were dropped or
swapped for OpenAI-only fallbacks. When the body says "Lyria does X" or
"Cursor SDK opens a PR," treat that as the original spec and refer to this
table for what actually runs:

| Original                              | Current state in code                                                                                  |
|---------------------------------------|--------------------------------------------------------------------------------------------------------|
| Twilio, Gemini Live, GPT-5.5 (extraction), GPT Image 2 (posters), Cloudflare, Convex, Vercel | **Wired** — runs end-to-end (mock harness covers no-keys runs).                                        |
| **Lyria** hold-music                  | **Removed.** The persona's stalling toolkit is the hold-music. No separate music track.                |
| **Veo 3** weekly recap                | **Replaced by GPT-5.5 markdown + GPT Image 2 hero poster.** Same Convex weekly cron, different output. |
| **Adaption Labs** persona tuning      | **Replaced by a GPT-5.5 self-tuner.** Same every-5-calls cadence, OpenAI-only.                          |
| **Cursor SDK** meta-agent + GitHub PR | **Replaced by a `proposedPersonas` Convex table** the dashboard renders. No GitHub automation.          |
| **Fal TTS, ElevenLabs**               | **Removed.** Out of scope.                                                                              |

Authoritative key list lives in [.env.example](../.env.example). The "Build
state" table in [README.md](../README.md) carries the same data in shorter
form. The §9 sponsor-track mapping below should be read against this
current-state table — it overrides the original mapping for anything marked
Removed/Replaced.

---

## 2. Problem Statement

- The global scam economy is estimated at **$1T+ per year**, with phone-based fraud
  driving a disproportionate share of consumer harm.
- Victims and carriers are stuck on defense — call-blocking, do-not-call lists, and
  reverse lookups are reactive and brittle.
- There is an **intelligence gap**: nobody systematically captures *what scammers are
  saying right now*, so research and consumer education lag the criminal economy by
  weeks or months.
- Every minute a scammer spends talking to a real human is a minute of revenue.
  Conversely, every minute they spend talking to **anyone else** is dead air.

Ring0 closes the gap by making "anyone else" an AI that is *infinitely patient,
infinitely curious, and infinitely cheap*.

---

## 3. Goals & Non-Goals

### Goals (6–7 hour MVP)
- Provision a working PSTN number that anyone can dial.
- Hold a **≥ 60-second** real-time AI conversation with a scammer/judge.
- Run **≥ 3 swappable personas** end-to-end.
- Extract a structured "scam signature" after every call.
- Render a public, real-time dashboard with transcripts and Most-Wanted posters.
- Demonstrate visible *self-improvement* via the Adaption Labs loop.

### Non-Goals
- Carrier-grade SIP integration.
- Legal/compliance review for two-party recording consent.
- Multi-language support (English-only for MVP).
- Mobile app.
- User authentication / accounts.

---

## 4. Target Users & Personas

- **Busy professional** who forwards unknown numbers to Ring0 and never sees them.
- **Vulnerable retiree** whose family routes their inbound to Ring0 by default.
- **Threat researcher** who consumes the public dashboard / API.
- **Hackathon judge** who dials the number on stage and watches the system react.

---

## 5. Core User Stories

1. *As a user*, I forward an unknown call to Ring0 and the AI handles it so I never
   hear it.
2. *As a scammer*, I dial what I think is a victim and get stuck on a call that goes
   nowhere for 7 minutes.
3. *As a researcher*, I open the Ring0 dashboard and see live transcripts, scam
   categories, and trending scripts.
4. *As a judge*, I dial the demo number, talk to the AI for 30 seconds, hang up, and
   see myself appear on the dashboard with a generated poster.

---

## 6. System Architecture (Sponsor-Aligned)

```
   ┌─────────┐   PSTN    ┌──────────────────────────────────────────┐
   │ Scammer │──────────▶│           Twilio <Stream>                │
   └─────────┘           └────────────────┬─────────────────────────┘
                                          │ WebSocket (μ-law)
                                          ▼
                       ┌──────────────────────────────────────────┐
                       │  Cloudflare Worker  +  Durable Object    │
                       │  (per-call state, audio buffer, routing) │
                       │  R2: raw audio │ KV: persona registry    │
                       └──────┬─────────────────┬─────────────────┘
                              │                 │
                              ▼                 ▼
                ┌──────────────────────┐  ┌──────────────────────┐
                │ Gemini flash-3.1-live│  │  Fal TTS / ElevenLabs │
                │ (primary persona)    │  │  (parallel personas)  │
                └──────┬───────────────┘  └──────────┬────────────┘
                       │                             │
                       └────────────┬────────────────┘
                                    │ call.ended
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │  Convex action  →  Post-Call Pipeline                  │
       │   • GPT-5.5    : classify + extract scam signature     │
       │   • GPT Image 2: generate "Most Wanted" poster         │
       │   • Lyria      : generate scam-themed hold music loop  │
       │   • Veo 3      : weekly recap clip (scheduled job)     │
       │   • CF Vectorize: dedupe / cluster signatures          │
       │   • Adaption Labs: rewrite winning persona prompt      │
       │   • Cursor SDK : meta-agent proposes new persona files │
       └────────────────────────────┬───────────────────────────┘
                                    │ reactive subscription
                                    ▼
                   ┌──────────────────────────────────────┐
                   │   Next.js Dashboard on Vercel        │
                   │   (live transcripts, posters, map,   │
                   │    learning curve, recap video)      │
                   └──────────────────────────────────────┘
```

---

## 7. Functional Requirements

### 7.1 Telephony Layer (Cloudflare-first)
- **Twilio** provisions the inbound number and bridges μ-law audio via `<Stream>`.
- **Cloudflare Workers** terminate the WebSocket; **Durable Objects** hold per-call
  state (callSid, personaId, audio buffers, partial transcript).
- **Cloudflare R2** stores raw audio for the post-call pipeline.
- **Cloudflare KV** stores the persona registry; **Cloudflare Queues** fan out the
  post-call jobs (extraction, image, music, vectorization).
- **Cloudflare Vectorize** indexes scam-signature embeddings for similarity dedupe.
- **Why this matters:** the entire control plane runs at the edge — measurable
  cold-start advantage, and it leans into the **$100k Cloudflare grand-prize stack**.

### 7.2 Voice Agent (Gemini Voice Track)
- **Primary model:** `gemini-flash-3.1-live` — target end-to-end turn <700ms.
- **Personas:** "Confused Grandma," "Distracted Dad," "Curious Teen,"
  "Suspicious Auntie."
- **Stalling toolkit:** ask to repeat, look for a pen, side-track with anecdotes.
- **Hard guardrails:** never give numbers, addresses, or codes.
- **Parallel voice variety:**
  - **Fal TTS** — fast personas + Whisper for backup transcription
    (targets *Best use of Fal*).
  - **ElevenLabs** — regional accents (uses participant 100k credits).

### 7.3 Post-Call Intelligence (OpenAI Track)
- **GPT-5.5** runs an *agentic* extraction loop — classify scam category, extract
  claimed organisation, social-engineering tactics, target demographic, danger score,
  and produce a `script_signature_hash`. The agent loop, not the JSON, is the demo
  (targets *Best use of GPT-5.5*).
- **GPT Image 2** generates a per-call "Most Wanted" poster styled by scam category
  (targets *Best use of GPT Image 2*).

### 7.4 Generative Media (Gemini Gen-Media Track)
- **Lyria:** generate a 30-second on-hold music loop themed to the detected scam
  category — actually played to the scammer mid-call.
- **Veo 3:** scheduled weekly "This week in scam-fighting" recap clip rendered into
  the dashboard (targets *Best Gen Media Track*).

### 7.5 Adaption Loop (Adaption Labs Track)
- After every 5 calls, **Adaption Labs** rewrites the winning persona's system prompt
  using {avgDurationSec, hangupReason, tactics_used} as feedback signals.
- Render a live "learning curve" chart on the dashboard — visible self-improvement is
  the headline demo moment.

### 7.6 Meta-Agent (Cursor SDK Track) — promoted from stretch to MVP
- A **Cursor SDK** agent watches the signature stream; when a new scam cluster appears
  in Vectorize, it opens a PR proposing a new persona file
  (`personas/<slug>.ts`) tuned for that cluster.
- Demo moment: judge calls in a fresh scam → PR appears live on stage.

### 7.7 Dashboard (Convex + Vercel)
- **Convex** schema (calls / personas / signatures / liveStats) with reactive
  subscriptions and a scheduled action driving the Veo 3 weekly recap.
- **Next.js** front-end deployed to **Vercel** (code AI-ENG-SINGAPORE).
- Modules: live transcript ticker, Most-Wanted gallery, scammer-minutes counter,
  origin map, scam-category leaderboard, learning curve, weekly Veo recap.

---

## 8. Non-Functional Requirements
- End-to-end voice turn latency **< 800 ms** (Gemini live → Twilio).
- Dashboard reflects new call **< 10 s** after hang-up.
- All caller PII redacted before signature is published (privacy guardrail).
- Edge-first deploy (Cloudflare Workers) for cold-start resilience.

---

## 9. Sponsor / Track Mapping

| Sponsor track                       | Ring0 surface                                            | Prize being targeted                       |
|-------------------------------------|----------------------------------------------------------|--------------------------------------------|
| **Cloudflare (grand prize stack)**  | Workers, Durable Objects, R2, KV, Queues, Vectorize      | 1st place — $100k Cloudflare credits       |
| **OpenAI – GPT-5.5**                | Agentic post-call extraction loop                        | Best use of GPT-5.5                        |
| **OpenAI – GPT Image 2**            | Per-category Most-Wanted posters                         | Best use of GPT Image 2                    |
| **Gemini – Voice Agent**            | `gemini-flash-3.1-live` persona                          | Best Voice Agent Track ($2.5k credits)     |
| **Gemini – Gen Media**              | Lyria hold-music + Veo 3 weekly recap                    | Best Gen Media Track ($2.5k credits)       |
| **Adaption Labs**                   | Per-persona learning loop + visible curve                | 1st — $1.5k cash + 1.5k credits            |
| **Convex**                          | Reactive dashboard + scheduled actions                   | Best use of Convex ($500 gift card)        |
| **Cursor SDK**                      | Meta-agent that authors new personas                     | Best use of Cursor SDK (Cursor Ultra 1-yr) |
| **Fal**                             | Parallel TTS personas + Whisper backup                   | Best use of Fal ($1k credits)              |
| **ElevenLabs**                      | Regional accent personas                                 | 100k participant credits                   |
| **Vercel**                          | Dashboard hosting (code AI-ENG-SINGAPORE)                | $30 participant credit                     |
| **Daytona**                         | Team dev environment                                     | $100 participant credit                    |
| **Hyperspell**                      | Optional: retrieval over scam corpus                     | Participant credit                         |

---

## 10. Data Model (Convex)

```ts
// calls
{ callSid, personaId, startedAt, endedAt, durationSec,
  transcript, scamCategory, dangerScore,
  signatureHash, signatureVectorId,
  posterImageUrl, holdMusicUrl }

// personas
{ personaId, name, systemPrompt, version,
  avgDurationSec, callsHandled }

// signatures
{ signatureHash, claimedOrg, tactics[], firstSeen, lastSeen, count }

// liveStats
{ totalCalls, totalScammerMinutes, weeklyRecapUrl }
```

---

## 11. 7-Hour Build Plan (30-min Blocks)

| Block | Time  | Output                                                                 |
|-------|-------|------------------------------------------------------------------------|
| 1     | 0:00  | Daytona env up, Twilio number, Cloudflare Worker skeleton              |
| 2     | 0:30  | WebSocket audio passthrough; R2 bucket + KV persona registry           |
| 3     | 1:00  | Gemini flash-3.1-live wired in; first persona ("Auntie") talking       |
| 4     | 1:30  | Stalling toolkit + guardrails; Fal TTS parallel persona                |
| 5     | 2:00  | Convex schema + Cloudflare Queue → post-call pipeline trigger          |
| 6     | 2:30  | GPT-5.5 extraction agent → signature JSON + Vectorize embed            |
| 7     | 3:00  | GPT Image 2 poster generation                                          |
| 8     | 3:30  | Lyria hold-music generation; play back to scammer mid-call             |
| 9     | 4:00  | Next.js dashboard scaffold on Vercel; live ticker + counter            |
| 10    | 4:30  | Adaption Labs loop + learning-curve chart                              |
| 11    | 5:00  | Cursor SDK meta-agent: PR on new scam cluster                          |
| 12    | 5:30  | Veo 3 weekly recap (pre-render demo clip)                              |
| 13    | 6:00  | End-to-end rehearsal + ElevenLabs accent persona swap                  |
| 14    | 6:30  | Demo polish, fallbacks, pitch dry-runs                                 |

---

## 12. Demo Script (3 minutes on stage)

1. **Hook (15s):** $1T scam economy.
2. **Live call (60s):** judge dials in → Auntie engages → Lyria hold music kicks in.
3. **Hang up (5s):** dashboard updates: transcript, Most-Wanted poster, signature.
4. **Aggregate view (30s):** scammer-minutes counter, origin map, learning curve.
5. **Meta-agent moment (20s):** Cursor SDK PR appears live proposing a new persona.
6. **Close (30s):** Veo 3 weekly recap plays — "this is what one week of Ring0 looks
   like" — open public API call.

---

## 13. Risks & Mitigations

| Risk                                  | Mitigation                                                  |
|---------------------------------------|-------------------------------------------------------------|
| Gemini Live latency spikes on stage   | Fal TTS fallback persona; pre-cached opening lines          |
| No live scam call during demo         | Pre-recorded scam audio replayed via SIP into Twilio number |
| Lyria / Veo render is slow            | Pre-bake one of each before demo                            |
| Venue Wi-Fi flaky                     | 5G hotspot; Cloudflare edge keeps state resilient           |
| Recording-consent legal risk          | Ship as MVP only; add disclaimer to public dashboard        |

---

## 14. Success Metrics

- Number answers within 2 rings.
- Sustained ≥ 60-second AI conversation on stage.
- Dashboard updates within 10 seconds of hang-up.
- Visibly hits ≥ 6 sponsor tracks during the 3-minute pitch.

---

## 15. Resolved Design Decisions

### 15.1 Privacy
- Default: PII-redacted public transcripts; raw transcripts gated behind
  researcher API key.
- Caller numbers are salted-SHA-256 hashed; raw audio in R2 with 24h TTL.
- GPT-5.5 redaction pass before any data hits Convex.

### 15.2 Language Roadmap
- MVP: English only.
- Phase 2: Mandarin + Cantonese (Singapore market).
- Phase 3: Spanish, Hindi, Tagalog.
- Phase 4: Auto-detect via Whisper, dynamic persona swap.
- ElevenLabs handles accent variety per language.

### 15.3 Unit Economics
- Cost per intercepted call: ~$0.15 (Twilio + Gemini + post-call AI).
- Free tier for individuals (50 calls/month), $9/mo Pro tier, enterprise
  signature-feed licensing ($5k-$50k/yr) for banks/telcos.
- Sponsored "Shield" tier for vulnerable populations.
- Primary revenue is threat-intel licensing, not consumer SaaS — every call
  produces a signature worth more than it cost to capture.


---

## 16. Tagline Options

- *"We don't block scammers. We answer them."*
- *"Every scam call, weaponised."*
- *"Built on the edge. Aimed at fraud."*

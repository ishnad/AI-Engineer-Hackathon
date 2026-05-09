# Ring0 — continue development

I'm building **Ring0**, an AI-powered phone-number-as-a-service that intercepts spam/scam calls, keeps callers engaged with a real-time AI persona, and contributes "scam signatures" to a public dashboard. AIE Hackathon project. Read these before doing anything substantial:

- `docs/PRD.md` — full product spec, 14 build blocks, sponsor track mapping. **§1.1 "Current build state" overrides anything below it** — the runtime swapped Lyria/Veo/Adaption/Cursor for OpenAI fallbacks.
- `.claude/CLAUDE.md` — Ring0-specific developer guidance + the "do not reintroduce" list
- `README.md` — repo layout + Build state table + end-to-end flow

## Live deployment

Worker is deployed; all Cloudflare bindings are provisioned; secrets are set; Convex is deployed.

| Resource | Value |
|---|---|
| Worker URL | `https://ring0-worker.mdanishboy.workers.dev` |
| Cloudflare account ID | `dcae27fa269b475125b62a2f5d83a641` |
| KV `PERSONAS` ID | `0f4cfef542534ff69165e049f44bd2b1` |
| R2 bucket | `ring0-call-audio` (free tier) |
| Vectorize index | `ring0-signatures` (1536-dim, cosine) |
| Convex | deployed; URL is set as worker secret `CONVEX_URL` |

Worker secrets set (via `npx wrangler secret put` from `worker/`): `GEMINI_API_KEY`, `OPENAI_API_KEY`, `TWILIO_AUTH_TOKEN`, `CONVEX_URL`, `PUBLIC_WORKER_URL`. Secrets take effect immediately — no redeploy needed.

**Workers Free tier** — Cloudflare Queues were removed (require Workers Paid, $5/mo). Post-call work runs inline from the Durable Object via `state.waitUntil(handlePostCallBatch(syntheticBatch, env))`. The consumer code path in [worker/src/queue-consumer.ts](../worker/src/queue-consumer.ts) is unchanged and its 11 tests still cover the same logic. To re-enable real Queues later: restore `[[queues.producers]]` + `[[queues.consumers]]` in [worker/wrangler.toml](../worker/wrangler.toml) and replace the synthetic batch in `CallSession.dispatchPostCall` with `POST_CALL_QUEUE.send(job)`.

## What's already built

| Path             | Status                                                                                          |
|------------------|--------------------------------------------------------------------------------------------------|
| `worker/`        | CF Worker + Durable Object + Twilio Stream ↔ Gemini Live bridge **and** OpenAI Realtime fallback (`worker/src/realtime.ts`, swap via `VOICE_PROVIDER=openai-realtime`). μ-law/PCM16 conversion at 16k (Gemini) and 24k (Realtime). Post-call work runs inline (`dispatchPostCall` → `handlePostCallBatch` with synthetic 1-msg batch). Structured JSON logger (`worker/src/logger.ts`) with `callSid` + per-stage `stepMs`/`totalMs` on Gemini/Realtime connect, first-audio, first-transcript, R2 put, inline pipeline dispatch, and every consumer stage. Honors `GEMINI_LIVE_URL` / `OPENAI_REALTIME_URL` / `OPENAI_BASE_URL` env overrides for the local mock harness |
| `personas/`      | Typed registry, 4 personas. Every prompt embeds `STALLING_TOOLKIT` + `HARD_GUARDRAILS` from `personas/src/stalling.ts` — preserve this pattern when editing |
| `pipeline/`      | All OpenAI-driven: GPT-5.5 extraction agent (tool-calling loop), GPT Image 2 per-call poster, GPT-5.5 persona tuner (`adaption.ts`, every-5-calls cadence), GPT-5.5 meta-agent (`meta-agent.ts`, proposes new personas via `proposePersona`), GPT-5.5 markdown + GPT Image 2 hero for the weekly recap (`veo-recap.ts`). `RING0_META_DRYRUN=1` logs the persona-author prompt as a `metaAgent.dryrun` record without hitting OpenAI. `buildPersonaAuthorPrompt(signature)` is exported as a pure function for direct testing |
| `dashboard/`     | Next.js + Convex reactive UI with `StatsCounters`, `LiveTranscripts`, `MostWanted`, `LearningCurve`, `SignatureLeaderboard`, `WeeklyRecap`, `ProposedPersonas` |
| `dashboard/convex/` | Full backend: mutations, queries, HTTP routes (`/ring0/...` in `http.ts`), weekly recap cron, persona seed, `proposedPersonas` table |
| `scripts/replay-call.mjs` | Demo-day backup. **5 scam variants** — `irs-impersonation`, `tech-support`, `romance`, `package-delivery`, `investment-fraud` — paired across all 4 personas, exercising every poster style. CLI: `node scripts/replay-call.mjs [<slug>\|--list]` |
| `scripts/mock/`  | Local mock harness: fake Gemini Live WS (`gemini-live.mjs`), fake OpenAI Realtime WS (`openai-realtime.mjs`), fake OpenAI HTTP (`openai.mjs`), fake Convex HTTP (`convex.mjs`, 200s every `/ring0/*` route), fake Twilio caller (`twilio-caller.mjs`), supervisor (`all.mjs`). Worker runs end-to-end via `wrangler dev` with `worker/.dev.vars.example` |
| `vitest.config.ts` + `*/test/` | **62 tests, all passing.** Coverage: μ-law round-trip + 8k↔24k resampling in `worker/src/audio.ts`; full `CallSession` lifecycle including provider switch (Gemini ↔ Realtime) and inline post-call dispatch; agent loop / hash determinism / clamping in `pipeline/src/extract.ts`; per-category prompt building + response handling in `pipeline/src/poster.ts`; meta-agent prompt builder + dry-run + live-mode shape parsing in `pipeline/src/meta-agent.ts`; consumer fan-out (extract retry, poster failure isolation, batch isolation, latency posting, `RING0_META_DRYRUN` plumbing). `npm test` |
| `.github/workflows/ci.yml` | GitHub Actions: `npm test` + `npm run lint` + worker/pipeline typecheck on push/PR. ESLint flat config + Prettier at the root. |
| `.env.example`   | Just the keys that are read by code — no orphaned placeholders                                   |

## Test a real call (Twilio webhook)

1. Twilio Console → **Phone Numbers** → **Active Numbers** → click your number
2. **Voice Configuration** → "A call comes in" → set **Webhook**
3. URL: `https://ring0-worker.mdanishboy.workers.dev/twilio/incoming`
4. HTTP method: **POST**
5. Save

Then dial the number from any phone. Expected flow:
- Twilio POSTs `/twilio/incoming` → worker returns TwiML pointing at `/twilio/stream`
- Twilio opens WS to `/twilio/stream` → CallSession DO spawns
- Persona connects to Gemini Live (or OpenAI Realtime if `VOICE_PROVIDER=openai-realtime`) and starts speaking ~600ms after the start frame
- Hangup → R2 audio dump + inline `handlePostCallBatch` → Convex updates the dashboard

Tail worker logs in another terminal while you test:
```bash
cd worker && npx wrangler tail
```
Look for `gemini.firstAudio` (or `realtime.firstAudio`) within ~800ms of `twilio.start` to confirm latency budget.

A/B between voice providers without redeploying:
```bash
cd worker && npx wrangler secret put VOICE_PROVIDER
# enter: openai-realtime  (or delete the secret to revert to Gemini default)
```

## Verify Convex HTTP routes

The worker hits Convex over plain HTTP at routes defined in [dashboard/convex/http.ts](../dashboard/convex/http.ts):

| Method | Path | Caller |
|---|---|---|
| POST | `/ring0/call/started` | `CallSession.notifyCallStarted` on first Twilio frame |
| POST | `/ring0/call/ended` | `handlePostCallBatch` (first stage) |
| POST | `/ring0/signature` | `handlePostCallBatch` after `extractSignature` |
| POST | `/ring0/poster` | `handlePostCallBatch` after `generatePoster` |
| POST | `/ring0/proposed-persona` | meta-agent (when `proposePersona` returns non-null) |
| POST | `/ring0/pipeline-stats` | `handlePostCallBatch` post-success (latency telemetry) |
| POST | `/ring0/persona/tune-window` | `tunePersonaIfDue` ([pipeline/src/adaption.ts](../pipeline/src/adaption.ts)) — returns the tune window or `null` if not due |
| POST | `/ring0/persona/refined` | `tunePersonaIfDue` after GPT-5.5 rewrites the system prompt |

Smoke test (replace `$CONVEX_URL` with the deployed URL — same value as the worker secret):
```bash
curl -X POST $CONVEX_URL/ring0/call/started \
  -H 'content-type: application/json' \
  -d '{"callSid":"CA-smoketest","personaId":"confused-auntie","startedAt":1735000000000}'
```
Expect HTTP 200. Open the dashboard — the call should appear in `StatsCounters` / `LiveTranscripts` immediately (Convex is reactive).

If a route returns 404 or shape-mismatches, edit `dashboard/convex/http.ts` and re-push:
```bash
cd dashboard && npx convex deploy
```

## Nice-to-haves (non-blocking)

- **Dashboard polish** — components use inline styles; could improve typography, mobile layout, motion (live-transcript token streaming, Most-Wanted entrance animation, `ProposedPersonas` card flow).
- **Iterate the meta-agent persona-author prompt** — `buildPersonaAuthorPrompt(signature)` is a pure function exported from `@ring0/pipeline`; call it from a vitest snapshot or Node one-liner. End-to-end exercise (live mode) requires `wrangler dev` + the mock OpenAI harness. Tightening this prompt is high-leverage since GPT-5.5 authors every proposed persona body.
- **Iterate the persona tuner prompt** (`pipeline/src/adaption.ts`) — same shape: extract a `buildTunerPrompt` pure function and unit-test it. No dry-run mode yet — worth adding (mirror `proposePersona({ dryRun: true })`) if iterating heavily.
- **Iterate the weekly recap prompt** (`pipeline/src/veo-recap.ts`) — markdown blurb + hero poster prompt are both inline; same refactor pattern.
- **Test coverage gap** — `pipeline/src/adaption.ts` and `pipeline/src/veo-recap.ts` have no dedicated tests yet; both are pure-function-around-fetch and should mock `vi.stubGlobal("fetch", ...)`.
- **CallSession edge cases** — reconnects, partial audio frames, Twilio `mark` events, barge-in handling. Connect-failure and mid-call drop paths are already covered by tests for both providers; remaining edges are testable end-to-end via the mock harness — extend `scripts/mock/gemini-live.mjs` or `scripts/mock/openai-realtime.mjs` to inject the failure mode.
- **Persona work** — refine prompts, add regional variants, sharpen the stalling toolkit. PRD is English-only for MVP but design for Mandarin/Cantonese phase 2.
- **End-to-end harness regression check** — run `npm run mock:all` + `wrangler dev` against `worker/.dev.vars.example` and confirm a synthetic call still completes through the inline post-call path (queue removal regression-check).
- **Re-enable Queues** if you upgrade to Workers Paid — restore `[[queues.producers]]` / `[[queues.consumers]]` in `worker/wrangler.toml` and swap the synthetic batch in `CallSession.dispatchPostCall` for `POST_CALL_QUEUE.send(job)`.

## Project conventions (from `.claude/CLAUDE.md` + my preferences)

- Edit existing files; don't create new ones unless required
- Default to **no comments** — only write a comment when the *why* is non-obvious. Never narrate *what* the code does.
- Be terse in chat output. Don't summarize what you just did at the end of every response.
- Don't over-engineer; no premature abstractions, no "future-proofing"
- Latency target: <800ms end-to-end voice turn
- Hard guardrail in every persona: never read out numbers, addresses, codes, OTPs
- Bash + PowerShell both available (Windows host)
- Don't commit unless I explicitly ask

## Sanity check

```bash
npm test                                # all 62 should pass
npm --workspace pipeline run typecheck  # clean
npm --workspace worker   run typecheck  # clean
npm --workspace dashboard run typecheck # clean (now that Convex generated files exist)
npm run lint                            # 0 errors (1 known warning in call-session.ts)
```

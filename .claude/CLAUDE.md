# CLAUDE.md — Ring0 Developer Guide

## Quick Reference
- **Project**: Ring0 — AI-powered spam/scam call interceptor
- **Tech Stack**: Cloudflare Workers, Gemini flash-3.1-live, Convex, Next.js, Vercel
- **Goal**: 7-hour hackathon build

## Claude's Role
Claude assists with:
- Writing/debugging Cloudflare Workers (WebSocket handling, Durable Objects)
- Refining Gemini persona prompts for realistic stalling tactics
- GPT-5.5 extraction logic, persona tuning, and meta-agent persona proposals
- Convex schema design and reactive queries
- Next.js dashboard components

## Key Constraints
- **Latency**: <800ms end-to-end voice turn
- **Demo target**: ≥60s sustained conversation
- **Safety**: Never give numbers, addresses, or codes in personas

## File Structure
```
/worker          # Cloudflare Worker (WebSocket bridge)
/personas        # AI persona prompts
/dashboard       # Next.js frontend (Vercel)
/pipeline        # Post-call extraction + tuning + meta-agent (all GPT-5.5)
/infrastructure  # Terraform/Wrangler configs
```

## Claude Context Tips
- When editing personas, preserve the "stalling toolkit" pattern
- For Cloudflare, prefer Durable Objects over global state
- For Convex, use reactive subscriptions for live dashboard updates
- Don't reintroduce Lyria, Veo 3, Adaption Labs, Cursor SDK, Fal, or
  ElevenLabs — the post-call pipeline runs on OpenAI alone (see "Build state"
  below). Don't add `GITHUB_TOKEN` / `GITHUB_REPO` / GitHub REST calls either
  — meta-agent output goes to Convex, not a PR.

## Quick Commands
```bash
# Deploy worker
wrangler deploy

# Run dev
wrangler dev

# Deploy dashboard
vercel --prod
```

## Build state

Every integration the runtime touches is wired. The originally-speculative
sponsor tracks were swapped to OpenAI fallbacks:

**Wired**: Gemini Live (voice), OpenAI GPT-5.5 (extraction + persona tuning +
meta-agent + weekly recap markdown), OpenAI GPT Image 2 (per-call posters +
weekly recap hero), Cloudflare Workers/DO/R2/KV/Queues/Vectorize, Convex,
Vercel.

**Removed** (do not reintroduce):
- Lyria hold-music — the persona's stalling toolkit IS the hold-music.
- Veo 3 — replaced by GPT-5.5 markdown + GPT Image 2 poster recap.
- Adaption Labs — replaced by a GPT-5.5 self-tuner on the same every-5-calls
  cadence ([pipeline/src/adaption.ts](../pipeline/src/adaption.ts)).
- Cursor SDK + GitHub PR automation — replaced by a `proposedPersonas` Convex
  table that the dashboard renders. No GitHub REST calls anywhere.
- Fal TTS, ElevenLabs — out of scope.

See `.env.example` for the authoritative key list.

## Sponsor Tracks to Highlight (still demo-able)
- Gemini Voice Agent (flash-3.1-live) — the live persona
- OpenAI GPT-5.5 — extraction agent (tool-calling), persona tuner, meta-agent
- OpenAI GPT Image 2 — Most Wanted posters + weekly recap hero
- Cloudflare Workers + Durable Objects + R2 + KV + Queues + Vectorize
- Convex — reactive dashboard + scheduled actions

Questions? Ask Claude about specific implementation blocks.

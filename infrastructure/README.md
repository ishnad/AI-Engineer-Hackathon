# Infrastructure

One-time provisioning that lives outside the Worker code.

## What goes here
- Wrangler bootstrap: KV, R2, Vectorize, Queues create commands.
- Twilio number purchase + webhook config (point `Voice URL` at
  `${PUBLIC_WORKER_URL}/twilio/incoming`).
- Convex deployment URL and initial seeding of `personas`.
- Vercel project link (use code `AI-ENG-SINGAPORE` for the participant credit).

## Quick bootstrap (fill in before block 1)

```bash
# Cloudflare resources referenced from worker/wrangler.toml
wrangler kv namespace create PERSONAS
wrangler r2 bucket create ring0-call-audio
wrangler vectorize create ring0-signatures --dimensions=768 --metric=cosine
wrangler queues create ring0-post-call

# Then update the `id = "REPLACE_WITH_KV_ID"` line in worker/wrangler.toml
# with the namespace ID printed above.
```

After Twilio gives you a number, set:

```bash
wrangler secret put GEMINI_API_KEY
wrangler secret put OPENAI_API_KEY
wrangler secret put TWILIO_AUTH_TOKEN
wrangler secret put CONVEX_URL
wrangler secret put PUBLIC_WORKER_URL  # e.g. https://ring0-worker.<acct>.workers.dev
```

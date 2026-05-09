// Demo backup (mitigates risk in §13 of docs/PRD.md).
//
// If no live scam dials in during the pitch, this script POSTs a fake call
// straight into the Convex HTTP routes — same payloads the Worker would
// send — so the dashboard updates exactly as it would in production.
//
// Usage:
//   node scripts/replay-call.mjs                       # replay all variants
//   node scripts/replay-call.mjs tech-support          # replay one
//   node scripts/replay-call.mjs --list                # show variants
//   CONVEX_URL=https://<deployment>.convex.cloud node scripts/replay-call.mjs

import process from "node:process";

const CONVEX_URL = process.env.CONVEX_URL ?? "http://127.0.0.1:8187";

// Stable Unsplash photos — picked once, no PII, used as poster placeholders.
// Each one has a visual that loosely matches the scam category.
const FIXTURES = [
  {
    slug: "irs-impersonation",
    personaId: "confused-auntie",
    transcript: [
      { role: "agent", t:     0, text: "Hello? ... Oh, hello dear, sorry — I was just feeding Biscuit. Who did you say you were with again?" },
      { role: "user",  t:  4500, text: "Ma'am, this is the IRS. We have a warrant for your arrest unless you pay $4,800 today." },
      { role: "agent", t:  9100, text: "The IRS? Goodness. Hold on, I need to find my reading glasses. Did you say four thousand or forty thousand?" },
      { role: "user",  t: 14000, text: "Four thousand eight hundred. You must pay in Apple gift cards immediately." },
      { role: "agent", t: 18200, text: "Apple? My nephew has an Apple. He's in the school play tomorrow. Could you spell your last name for me?" },
      { role: "user",  t: 24500, text: "I am Officer Johnson. J-O-H-N-S-O-N. Stay on the line." },
      { role: "agent", t: 31000, text: "Officer Johnson, that's a lovely name. My late husband had a cousin named Johnson. From Cleveland. Are you from Cleveland?" },
    ],
    durationSec: 92,
    signature: {
      signatureHash: "demo-irs-johnson-001",
      scamCategory: "irs-impersonation",
      claimedOrg: "Internal Revenue Service",
      tactics: ["authority", "urgency", "fear", "gift-card-payment"],
      targetDemographic: "elderly",
      dangerScore: 8.5,
      summary: "Caller impersonated an IRS officer, demanded $4,800 in Apple gift cards under threat of arrest.",
    },
    posterImageUrl:
      "https://images.unsplash.com/photo-1542856204-00101eb6def4?w=600&fit=crop&q=80",
  },
  {
    slug: "tech-support",
    personaId: "distracted-dad",
    transcript: [
      { role: "agent", t:     0, text: "Hello? Sorry — kids, I said five more minutes! Hi, who's this?" },
      { role: "user",  t:  3800, text: "Sir, I'm calling from Microsoft. Your computer is sending us critical error messages." },
      { role: "agent", t:  8200, text: "Microsoft? Oh man, the computer's been slow. Hang on — Tyler, that goes in the recycling, not the trash." },
      { role: "user",  t: 14500, text: "Sir, please go to your computer right now. We need to install a security tool before your files are deleted." },
      { role: "agent", t: 19800, text: "Yeah, yeah, I'm walking over. Wait, which computer? We've got the laptop and the one in the den. Hold on, I'm going to put you on speaker." },
      { role: "user",  t: 27000, text: "Either is fine. Open your browser and go to the address I'll give you." },
      { role: "agent", t: 31200, text: "Browser, okay. Is that the blue 'e' or the orange fox? My wife uses the fox. Tyler! What did I say about the recycling?" },
      { role: "user",  t: 37500, text: "The blue one is fine, sir. Type teamview-support dot com." },
      { role: "agent", t: 42800, text: "Team-view... is that one word or two? And do I press space? Sorry, the dog's barking. What was the address again?" },
    ],
    durationSec: 138,
    signature: {
      signatureHash: "demo-tech-microsoft-014",
      scamCategory: "tech-support",
      claimedOrg: "Microsoft",
      tactics: ["impersonation", "false-urgency", "remote-access-bait"],
      targetDemographic: "general",
      dangerScore: 7.2,
      summary: "Caller posed as Microsoft tech support, attempting to install remote-access software via a typo-squatted domain.",
    },
    posterImageUrl:
      "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&fit=crop&q=80",
  },
  {
    slug: "romance",
    personaId: "curious-teen",
    transcript: [
      { role: "agent", t:     0, text: "Hi! Sorry, who is this? I don't recognize the number." },
      { role: "user",  t:  3500, text: "It is me, my love. We met on the app two weeks ago. I am the engineer on the oil rig." },
      { role: "agent", t:  8000, text: "Oh wait — yes! Of course. Sorry, I'm bad with voices on the phone. How's the rig? Is it stormy?" },
      { role: "user",  t: 13500, text: "Very stormy, my heart. I miss you. Listen, I have an emergency. The supply boat needs $1,200 wire transfer." },
      { role: "agent", t: 19200, text: "A wire transfer? That's a lot. Why doesn't your company pay it? Don't oil rigs have, like, budgets?" },
      { role: "user",  t: 25500, text: "The accounts are frozen until I return to shore. Once I land in your city next month, I will repay you triple, my love." },
      { role: "agent", t: 32000, text: "Mhm. Quick question — what's the nearest big city to your rig? Just curious, I'm doing geography homework." },
      { role: "user",  t: 38500, text: "It is in the North Sea. Off the coast of Scotland. Please, my heart, the wire — Western Union, today." },
      { role: "agent", t: 44800, text: "Cool cool. Hey, can you send me a selfie real quick? Like, with today's newspaper? Just so my mom knows you're real." },
    ],
    durationSec: 156,
    signature: {
      signatureHash: "demo-romance-rig-022",
      scamCategory: "romance",
      claimedOrg: null,
      tactics: ["affection-bombing", "emergency-fabrication", "wire-transfer-request", "future-promise"],
      targetDemographic: "isolated-adults",
      dangerScore: 6.8,
      summary: "Caller posed as a long-distance romantic partner stranded on an oil rig, requesting an emergency Western Union transfer.",
    },
    posterImageUrl:
      "https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?w=600&fit=crop&q=80",
  },
  {
    slug: "package-delivery",
    personaId: "distracted-dad",
    transcript: [
      { role: "agent", t:     0, text: "Hello? Sorry, hold on — Tyler, the dog is NOT a horse. Hi, who is this?" },
      { role: "user",  t:  3200, text: "This is FedEx. We have a package for you that requires a $3.95 redelivery fee." },
      { role: "agent", t:  7800, text: "FedEx? I wasn't expecting anything. Or wait — was it the Amazon thing? Or the thing my sister said she'd send?" },
      { role: "user",  t: 13500, text: "Sir, I cannot disclose the contents. I just need you to confirm your card details for the redelivery fee." },
      { role: "agent", t: 19000, text: "On the phone? Don't they usually leave a slip? Last time they left a slip on the door. With a barcode." },
      { role: "user",  t: 24800, text: "The slip system is down today. Please read the long number on the front of your card." },
      { role: "agent", t: 30500, text: "The whole long number? Hang on, I gotta find my wallet. TYLER! Where did you put my wallet?" },
      { role: "user",  t: 37000, text: "Sir, please hurry. The package returns to the depot at 5pm." },
      { role: "agent", t: 41800, text: "Five PM? That's like in two hours. Okay okay. While I look — what address is the package going to? Just so I'm sure it's mine." },
    ],
    durationSec: 124,
    signature: {
      signatureHash: "demo-pkg-fedex-031",
      scamCategory: "package-delivery",
      claimedOrg: "FedEx",
      tactics: ["impersonation", "small-fee-bait", "urgency-deadline", "card-harvest"],
      targetDemographic: "general",
      dangerScore: 6.4,
      summary: "Caller posed as FedEx requesting a $3.95 redelivery fee to harvest credit-card details.",
    },
    posterImageUrl:
      "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&fit=crop&q=80",
  },
  {
    slug: "investment-fraud",
    personaId: "suspicious-auntie",
    transcript: [
      { role: "agent", t:     0, text: "Hello. Yes, who is this and how did you get this number?" },
      { role: "user",  t:  3000, text: "Ma'am, my name is Daniel. I'm a wealth advisor. I want to share an opportunity returning 32% guaranteed in ninety days." },
      { role: "agent", t:  8500, text: "Thirty-two percent. Guaranteed. In ninety days. You said 'guaranteed,' yes?" },
      { role: "user",  t: 14000, text: "Yes ma'am, guaranteed. We have a special pre-IPO crypto allocation. Only six slots left." },
      { role: "agent", t: 19800, text: "Daniel — what's your last name? And the firm. The full firm name. And your CRD number, please." },
      { role: "user",  t: 26500, text: "It's Daniel Smith. The firm is Apex Capital Strategies. Ma'am, the slots will be gone by tonight." },
      { role: "agent", t: 33200, text: "Apex Capital Strategies. Daniel Smith. CRD number — you didn't say it. Are you registered with FINRA, Daniel?" },
      { role: "user",  t: 39800, text: "Yes ma'am, of course. Look, can we move forward? I just need a $5,000 wire to lock in your slot." },
      { role: "agent", t: 46500, text: "I'm going to have to call you back, Daniel. After I look up Apex Capital Strategies. Stay on the line — what's the spelling? A-P-E-X?" },
    ],
    durationSec: 168,
    signature: {
      signatureHash: "demo-invest-apex-047",
      scamCategory: "investment-fraud",
      claimedOrg: "Apex Capital Strategies",
      tactics: ["guaranteed-returns", "false-scarcity", "pre-ipo-bait", "wire-transfer-request"],
      targetDemographic: "retirees",
      dangerScore: 9.1,
      summary: "Caller pitched a fake 'guaranteed 32%' pre-IPO crypto allocation requiring a $5k wire transfer.",
    },
    posterImageUrl:
      "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&fit=crop&q=80",
  },
];

async function post(path, body) {
  const url = CONVEX_URL.replace(/\/+$/, "") + path;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("✖", path, res.status, await res.text().catch(() => ""));
    process.exit(1);
  }
  console.log("  ✓", path);
}

async function replay(fixture, index) {
  const callSid = `DEMO-${fixture.slug}-${Date.now()}-${index}`;
  const startedAt = Date.now() - fixture.durationSec * 1000;

  console.log(`\n[${fixture.slug}] callSid=${callSid} persona=${fixture.personaId}`);

  await post("/ring0/call/started", {
    callSid,
    personaId: fixture.personaId,
    startedAt,
  });

  // Tiny pause so the dashboard renders the "live" state before the call ends.
  await new Promise((r) => setTimeout(r, 800));

  await post("/ring0/call/ended", {
    callSid,
    durationSec: fixture.durationSec,
    transcript: fixture.transcript,
  });

  await post("/ring0/signature", { callSid, signature: fixture.signature });
  await post("/ring0/poster", { callSid, posterImageUrl: fixture.posterImageUrl });
  await post("/ring0/proposed-persona", {
    slug: fixture.signature.scamCategory,
    scamCategory: fixture.signature.scamCategory,
    signatureHash: fixture.signature.signatureHash,
    systemPrompt: `You are a Ring0 persona for ${fixture.signature.scamCategory}. STALLING_TOOLKIT. HARD_GUARDRAILS.`,
    rationale: `Demo replay — proposed persona for the ${fixture.signature.scamCategory} cluster.`,
  });
}

const arg = process.argv[2];

if (arg === "--list" || arg === "-l") {
  console.log("Available variants:");
  for (const f of FIXTURES) console.log(`  ${f.slug.padEnd(20)} (persona: ${f.personaId})`);
  process.exit(0);
}

const selected = arg
  ? FIXTURES.filter((f) => f.slug === arg)
  : FIXTURES;

if (arg && selected.length === 0) {
  console.error(`unknown variant: ${arg}`);
  console.error(`run \`node scripts/replay-call.mjs --list\` to see options`);
  process.exit(1);
}

console.log(`Replaying ${selected.length} fixture(s) → ${CONVEX_URL}`);

for (let i = 0; i < selected.length; i++) {
  await replay(selected[i], i);
  // Stagger so the dashboard's "Live Transcripts" feed reads as a sequence
  // rather than a thundering herd.
  if (i < selected.length - 1) await new Promise((r) => setTimeout(r, 1500));
}

console.log("\ndone — refresh the dashboard.");

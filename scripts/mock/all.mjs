// Spin up every fake sponsor service the Worker depends on.
//
// Run this in one terminal, then in another terminal:
//   wrangler dev   (with .dev.vars pointing at the mock URLs — see worker/.dev.vars.example)
//   npm run mock:caller
//
// This script does NOT start `wrangler dev` itself; the Worker needs to read
// .dev.vars at boot, and we don't want to fight that lifecycle.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const services = [
  { name: "mock-gemini",   file: "gemini-live.mjs" },
  { name: "mock-realtime", file: "openai-realtime.mjs" },
  { name: "mock-openai",   file: "openai.mjs" },
  { name: "mock-convex",   file: "convex.mjs" },
];

const procs = services.map(({ name, file }) => {
  const p = spawn(process.execPath, [join(here, file)], { stdio: "inherit" });
  p.on("exit", (code) => {
    console.error(`[${name}] exited (${code}) — tearing down`);
    for (const other of procs) if (other !== p) other.kill();
    process.exit(code ?? 1);
  });
  return p;
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    for (const p of procs) p.kill();
    process.exit(0);
  });
}

console.log(`
[mock-all] running ${services.length} mocks.

In a second terminal:
  cd worker && wrangler dev
In a third:
  npm run mock:caller

(See worker/.dev.vars.example for the env vars to copy into worker/.dev.vars.)
`);

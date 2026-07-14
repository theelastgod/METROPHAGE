#!/usr/bin/env node
// Poll /health and print warnings. Exit 1 if degraded or unreachable.
//   node tools/watch-health.mjs
//   HEALTH_URL=https://…/health INTERVAL_MS=30000 node tools/watch-health.mjs

const URL =
  process.env.HEALTH_URL || "https://metrophage-server.wendellphillips.workers.dev/health";
const INTERVAL = Math.max(5000, Number(process.env.INTERVAL_MS) || 60_000);
const ONCE = process.argv.includes("--once");

async function probe() {
  const t0 = Date.now();
  try {
    const res = await fetch(URL, { cache: "no-store" });
    const ms = Date.now() - t0;
    const body = await res.json();
    const warn = body.warnings?.length ? body.warnings.join(",") : "—";
    const players = body.sample?.playersTotal ?? "?";
    const sink = body.economy?.sinkEfficiency7d;
    console.log(
      `[${new Date().toISOString()}] ok=${body.ok} degraded=${!!body.degraded} build=${body.build} players=${players} sink7d=${sink ?? "?"} latencyMs=${ms} warnings=${warn}`,
    );
    if (!res.ok || !body.ok) process.exitCode = 1;
    if (body.degraded && process.env.FAIL_ON_DEGRADED === "1") process.exitCode = 1;
    return body;
  } catch (e) {
    console.error(`[${new Date().toISOString()}] FAIL ${e}`);
    process.exitCode = 1;
    return null;
  }
}

if (ONCE) {
  await probe();
  process.exit(process.exitCode || 0);
}

console.log(`watch-health → ${URL} every ${INTERVAL}ms (Ctrl+C to stop)`);
for (;;) {
  await probe();
  await new Promise((r) => setTimeout(r, INTERVAL));
}

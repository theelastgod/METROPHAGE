#!/usr/bin/env node
// Pretty-print the live /economy dashboard (local wrangler or prod).
// Usage: node tools/economy-report.mjs [base-url]
//   default base: http://127.0.0.1:8787   (prod: https://metrophage-server.wendellphillips.workers.dev)

const base = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const r = await fetch(`${base}/economy`).then((x) => x.json());
if (!r.ok) {
  console.error("economy endpoint error:", r);
  process.exit(1);
}
const { credits: c, token: t, forecast: f } = r;
const line = (k, v) => console.log(`  ${k.padEnd(30)} ${v}`);
const kinds = (o) =>
  Object.entries(o ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join("  ") || "—";

console.log(`METROPHAGE economy — ${r.asOf}  (${base})`);
console.log("\n₵ CREDIT SUPPLY");
line("circulating", `${c.circulating.toLocaleString()} ₵ across ${c.players} players`);
line("emitted / burned today", `${c.emittedToday} / ${c.burnedToday} ₵`);
line("emitted / burned 7d", `${c.emitted7d} / ${c.burned7d} ₵`);
line("sink efficiency 7d", c.sinkEfficiency7d === null ? "n/a" : `${Math.round(c.sinkEfficiency7d * 100)}% of new credits destroyed`);
line("emit by kind 7d", kinds(c.emitByKind7d));
line("burn by kind 7d", kinds(c.burnByKind7d));
console.log("\n◈ TOKEN LINKAGE");
line("bridge rate", `${t.rateCreditsPerMetro} ₵ → 1 $METRO`);
line("treasury pool", `${t.poolMetro} $METRO`);
line("implied liability", `${t.impliedLiabilityMetro} $METRO (all circulating ₵ at the exit rate)`);
line("coverage ratio", t.coverageRatio === null ? "n/a (no liability)" : `${Math.round(t.coverageRatio * 100)}%`);
line("reward emission 7d", `${t.emission7dMetro} $METRO-equivalent`);
console.log("\n📈 FORECAST — " + f.method);
line("deposits / day", `${f.depositsPerDayMetro} $METRO`);
line("withdrawals / day", `${f.withdrawalsPerDayMetro} $METRO`);
line("net pool / day", `${f.netPoolPerDayMetro} $METRO`);
line("pool in 30d", `${f.pool30dMetro} $METRO`);
line("days until dry", f.daysUntilDry === null ? "not draining" : `${f.daysUntilDry}d ⚠`);
line("credits minted / day", `${f.emittedCreditsPerDay} ₵`);

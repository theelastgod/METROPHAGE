#!/usr/bin/env node
// $METRO bridge sustainability simulator — 1% seed + 500-player P2E.
//
// Model (matches src/game/economyPolicy.ts + server/src/metro.ts):
//   pool starts with DEV_SEED (10M = 1% of 1B)
//   deposit:  1 $METRO → 100 ₵
//   withdraw: 150 ₵ → 1 $METRO (healthy); stress widens further
//   daily emit cap ~1200 ₵; daily withdraw cap ~4500 ₵
//   global daily withdraw ≤ 1.5% of pool
//
// Usage: node tools/economy-sim.mjs [days=180] [trials=300]

const DEP_CREDITS = 100;
const WD_CREDITS = 150;
const MIN_WD = 300;
const DEV_SEED = 10_000_000;
const DAILY_EMIT = 1_800;
const DAILY_WD_CAP = 6_000;
const GLOBAL_WD_FRAC = 0.02;

const DAYS = parseInt(process.argv[2] ?? "180", 10);
const TRIALS = parseInt(process.argv[3] ?? "300", 10);

function noisy(mean, rng) {
  if (mean <= 0) return 0;
  return Math.max(0, Math.round(mean * (0.55 + rng())));
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function trial(s, seed) {
  const rng = mulberry32(seed);
  const nDep = Math.round(s.players * s.depositorShare);
  const nFarm = Math.max(0, s.players - nDep);
  let pool = s.seed; // $METRO
  let credits = 0;
  let unserved = 0;
  let served = 0;
  let firstDry = -1;
  let emitTotal = 0;

  for (let d = 0; d < s.days; d++) {
    if (d < s.churnDay) {
      const dep = noisy(nDep * s.depositsPerDepositorDay, rng);
      pool += dep;
    }

    // Farmers earn up to daily emit cap; only cashoutShare hits the bridge.
    const earn = Math.min(DAILY_EMIT, noisy(s.farmerEarnPerDay, rng));
    emitTotal += earn * nFarm;
    credits += Math.round(nFarm * earn * s.cashoutShare);

    const globalLeft = pool * GLOBAL_WD_FRAC;
    let dayWdMetro = 0;

    if (credits >= MIN_WD) {
      // Per-player-ish cap approximation: total personal caps.
      const personalCapMetro = (nFarm * DAILY_WD_CAP) / WD_CREDITS;
      const want = Math.min(Math.floor(credits / WD_CREDITS), personalCapMetro, globalLeft);
      const got = Math.min(want, pool);
      pool -= got;
      dayWdMetro += got;
      served += got;
      credits -= got * WD_CREDITS;
      const refused = Math.max(0, Math.floor(credits / WD_CREDITS) - 0);
      // Only count refuse when pool or global cap blocked further cashout.
      if (pool < 1 || dayWdMetro >= globalLeft - 1e-9) {
        const stillWant = Math.floor(credits / WD_CREDITS);
        if (stillWant > 0) {
          unserved += stillWant;
          if (firstDry < 0) firstDry = d;
        }
      }
    }
  }
  return { pool, served, unserved, firstDry, emitTotal };
}

function run(name, s) {
  let dryTrials = 0;
  let sumFirstDry = 0;
  let sumUnservedPct = 0;
  let sumEndPool = 0;
  let sumServed = 0;
  for (let t = 0; t < TRIALS; t++) {
    const r = trial({ ...s, days: DAYS }, t * 2654435761);
    if (r.firstDry >= 0) {
      dryTrials++;
      sumFirstDry += r.firstDry;
    }
    const demand = r.served + r.unserved;
    sumUnservedPct += demand > 0 ? r.unserved / demand : 0;
    sumEndPool += r.pool;
    sumServed += r.served;
  }
  const dryPct = (100 * dryTrials) / TRIALS;
  const avgDry = dryTrials ? Math.round(sumFirstDry / dryTrials) : null;
  const avgServedPerPlayerDay = sumServed / TRIALS / DAYS / Math.max(1, s.players * (1 - s.depositorShare));
  console.log(
    `${name.padEnd(40)} dry:${dryPct.toFixed(0).padStart(4)}%  firstDry:${
      avgDry === null ? "  never" : String(avgDry).padStart(5) + "d"
    }  unserved:${((100 * sumUnservedPct) / TRIALS).toFixed(1).padStart(6)}%  endPool:${Math.round(sumEndPool / TRIALS)
      .toString()
      .padStart(10)} $M  ~◈/farmer-day:${avgServedPerPlayerDay.toFixed(2)}`,
  );
}

console.log(
  `$METRO P2E sim — ${DAYS}d × ${TRIALS} trials · seed ${DEV_SEED.toLocaleString()}◈ (1%) · dep ${DEP_CREDITS}₵ / wd ${WD_CREDITS}₵ · emit ${DAILY_EMIT}₵ · wdCap ${DAILY_WD_CAP}₵`,
);
console.log(`target: 500 players · money in token terms (USD floats with market)\n`);

const base = {
  players: 500,
  seed: DEV_SEED,
  depositorShare: 0.12,
  depositsPerDepositorDay: 1.5,
  farmerEarnPerDay: 1_000,
  cashoutShare: 0.35,
  churnDay: Infinity,
};

run("baseline 500p · 18% cashout · seed", base);
run("aggressive 30% cashout", { ...base, cashoutShare: 0.3 });
run("no depositors after seed", { ...base, depositorShare: 0, churnDay: 0 });
run("hype dies day 45", { ...base, churnDay: 45 });
run("thin seed 2.5M (0.25%)", { ...base, seed: 2_500_000 });
run("100 players", { ...base, players: 100 });
run("grind heavy earn", { ...base, farmerEarnPerDay: 1200, cashoutShare: 0.25 });

console.log(`\nreading: endPool should stay >> 0 with 1% seed. ~◈/farmer-day is average
successful cash-out in $METRO (price-agnostic P2E unit). Comparable web3 P2E aims for
several tokens/day for active play when the pool is healthy.`);

#!/usr/bin/env node
// $METRO bridge sustainability simulator.
//
// Model (matches server/src/metro.ts BRIDGE):
//   deposit:  1 $METRO into the pool  → player is minted 100 ₵ (off-chain)
//   withdraw: burn 125 ₵              → 1 $METRO paid FROM the pool
//   min withdraw 250 ₵ (2 $METRO); withdrawals FAIL when the pool is short.
//
// The pool is 100% player-funded (fixed supply, no dev seeding), so the only
// question that matters is: under a given mix of depositors (players converting
// $METRO → credits to gear up) and farmers (players earning credits in-game and
// cashing out), how long does the pool stay solvent and how much withdraw
// demand goes unserved?
//
// Usage: node tools/economy-sim.mjs [days=365] [trials=500]

const DEP_CREDITS = 100; // credits minted per 1 $METRO deposited
const WD_CREDITS = 125; // credits burned per 1 $METRO withdrawn
const MIN_WD = 250; // credit floor per withdrawal (2 $METRO)

const DAYS = parseInt(process.argv[2] ?? "365", 10);
const TRIALS = parseInt(process.argv[3] ?? "500", 10);

// Poisson-ish integer noise around a mean (cheap, good enough here).
function noisy(mean, rng) {
  if (mean <= 0) return 0;
  const jitter = 0.5 + rng(); // 0.5..1.5×
  return Math.max(0, Math.round(mean * jitter));
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

/**
 * One trial.
 * @param s scenario: players, depositorShare, depositsPerDepositorDay ($METRO),
 *          farmerEarnPerDay (credits available to cash out), churnDay (day the
 *          depositor inflow stops — e.g. hype dies), rng seed
 */
function trial(s, seed) {
  const rng = mulberry32(seed);
  const nDep = Math.round(s.players * s.depositorShare);
  const nFarm = s.players - nDep;
  let pool = 0; // $METRO
  let credits = 0; // farmer credit stockpile waiting to cash out
  let unserved = 0; // $METRO of withdraw demand refused (pool dry)
  let served = 0;
  let firstDry = -1;
  for (let d = 0; d < s.days; d++) {
    // Depositor inflow (dies after churnDay).
    if (d < s.churnDay) {
      const dep = noisy(nDep * s.depositsPerDepositorDay, rng);
      pool += dep;
    }
    // Farmers earn credits; only `cashoutShare` of earnings is routed to the
    // bridge (the rest is spent in-game on gear/forge/cosmetics — real sinks).
    credits += noisy(nFarm * s.farmerEarnPerDay * s.cashoutShare, rng);
    if (credits >= MIN_WD) {
      const want = Math.floor(credits / WD_CREDITS); // $METRO demanded
      const got = Math.min(want, pool);
      pool -= got;
      served += got;
      credits -= got * WD_CREDITS;
      const refused = want - got;
      if (refused > 0) {
        unserved += refused;
        if (firstDry < 0) firstDry = d;
        // Refused demand stays as credits (players hold and retry).
      }
    }
  }
  return { pool, served, unserved, firstDry };
}

function run(name, s) {
  let dryTrials = 0;
  let sumFirstDry = 0;
  let sumUnservedPct = 0;
  let sumEndPool = 0;
  for (let t = 0; t < TRIALS; t++) {
    const r = trial({ ...s, days: DAYS }, t * 2654435761);
    if (r.firstDry >= 0) {
      dryTrials++;
      sumFirstDry += r.firstDry;
    }
    const demand = r.served + r.unserved;
    sumUnservedPct += demand > 0 ? r.unserved / demand : 0;
    sumEndPool += r.pool;
  }
  const dryPct = (100 * dryTrials) / TRIALS;
  const avgDry = dryTrials ? Math.round(sumFirstDry / dryTrials) : null;
  console.log(
    `${name.padEnd(34)} dry:${dryPct.toFixed(0).padStart(4)}%  firstDry:${
      avgDry === null ? "  never" : String(avgDry).padStart(5) + "d"
    }  unserved:${((100 * sumUnservedPct) / TRIALS).toFixed(1).padStart(6)}%  endPool:${Math.round(sumEndPool / TRIALS)
      .toString()
      .padStart(8)} $M`,
  );
}

console.log(`$METRO bridge sim — ${DAYS} days × ${TRIALS} trials  (deposit ${DEP_CREDITS}₵ / withdraw ${WD_CREDITS}₵ / min ${MIN_WD}₵)`);
console.log(`equilibrium rule: pool survives iff deposited $METRO/day ≥ farmer credits/day ÷ ${WD_CREDITS}\n`);

// Farmer earn baseline: ~18₵/kill, dailies ~1200₵ → ~400₵/day casual net.
// cashoutShare = fraction of those earnings routed to the bridge rather than
// spent in-game. This is THE lever: in-game sinks are what keep the pool alive.
const base = {
  players: 500,
  depositorShare: 0.1,
  depositsPerDepositorDay: 2,
  farmerEarnPerDay: 400,
  cashoutShare: 0.05,
  churnDay: Infinity,
};

run("baseline: 5% earnings bridged", base);
run("10% earnings bridged", { ...base, cashoutShare: 0.1 });
run("20% earnings bridged", { ...base, cashoutShare: 0.2 });
run("thin whales (4%), 5% bridged", { ...base, depositorShare: 0.04 });
run("hype dies day 30, 5% bridged", { ...base, churnDay: 30 });
run("hype dies day 30, 10% bridged", { ...base, churnDay: 30, cashoutShare: 0.1 });
run("small pop (50), 5% bridged", { ...base, players: 50 });
run("small pop + hype dies day 14", { ...base, players: 50, churnDay: 14 });
// Break-even sweep: at what bridged share does the pool tip over?
console.log("");
for (const cs of [0.02, 0.04, 0.06, 0.08, 0.1, 0.14]) {
  run(`sweep: ${(cs * 100).toFixed(0)}% bridged, steady whales`, { ...base, cashoutShare: cs });
}

console.log(`\nreading: "dry" = % of trials where a withdrawal was ever refused; "unserved" = avg share of
withdraw demand refused. The spread (${WD_CREDITS - DEP_CREDITS}₵/round-trip) only slows drain — it cannot
save a pool whose depositor inflow stops while farmers keep earning. Levers if unserved
is unacceptable: raise WD rate (wider spread), daily withdraw cap, or a sink that burns
credits before they reach the bridge (cosmetics, fees).`);

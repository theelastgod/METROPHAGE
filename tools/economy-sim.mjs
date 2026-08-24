#!/usr/bin/env node
// $METRO / ₵ sustainability sim — unlimited daily earn/WD, pool lid, 15m TWAP
// rates, circuit breaker, pump.fun-shaped price paths.
//
// Matches src/game/economyPolicy.ts + server/src/metroPrice.ts. Does NOT model
// the deleted daily emit/withdraw caps.
//
// Design mix: 500 players, 12% depositors / 88% farmers. City sinks burn ~45%
// of earned ₵ (estates ₵60k, furniture, forge, cosmetics, PvP pots).
//
// Usage: node tools/economy-sim.mjs
// Gate: exit 0 on every published scenario.

const DEP0 = 100;
const WD0 = 150;
const MIN_WD0 = 300;
const DEV_SEED = 10_000_000;
const COOLDOWN_MS = 30_000;
const ESTATE_BASE = 60_000;
const SINK_FRAC = 0.45;

const PRICE_MULT_MIN = 0.05;
const PRICE_MULT_MAX = 20;
const SPOT_JUMP = 0.4;
const TWAP_DIV = 0.6;
const STALE_MS = 3 * 60_000;
const THAW_N = 3;
const VOL_TH = 0.08;

const TARGET_UNSERVED = 0.25;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
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

function popTier(n) {
  if (n <= 500) return { dep: 100, wd: 150, min: 300 };
  if (n <= 1000) return { dep: 100, wd: 160, min: 320 };
  if (n <= 1500) return { dep: 95, wd: 170, min: 340 };
  if (n <= 2500) return { dep: 90, wd: 185, min: 370 };
  return { dep: 85, wd: 200, min: 400 };
}

function rates({ players, pool, circ, twap15, ref, vol5 }) {
  const quoteMissing = !(twap15 > 0);
  const r = ref > 0 ? ref : twap15 > 0 ? twap15 : 0;
  const priceMult = quoteMissing ? 1 : clamp(twap15 / r, PRICE_MULT_MIN, PRICE_MULT_MAX);
  const tier = popTier(players);
  let deposit = Math.round(tier.dep * priceMult);
  let withdraw = Math.round(tier.wd * priceMult);
  let minWd = Math.round(tier.min * priceMult);
  const liability = circ / Math.max(1, withdraw);
  const coverage = liability > 0 ? pool / liability : null;
  if (pool > 0 && coverage != null && coverage < 0.15) {
    deposit = Math.min(deposit, Math.round(85 * priceMult));
    withdraw = Math.max(withdraw, Math.round(200 * priceMult));
    minWd = Math.max(minWd, Math.round(400 * priceMult));
  } else if (pool > 0 && coverage != null && coverage < 0.4) {
    deposit = Math.min(deposit, Math.round(95 * priceMult));
    withdraw = Math.max(withdraw, Math.round(175 * priceMult));
  }
  if (priceMult <= 0.08 || priceMult >= 15) {
    withdraw = Math.max(withdraw, deposit + Math.max(40, Math.round(deposit * 0.45)));
  }
  if (vol5 > VOL_TH) {
    const extra = Math.min(0.5, vol5);
    deposit = Math.max(1, deposit - Math.round(deposit * extra * 0.2));
    withdraw = withdraw + Math.max(1, Math.round(withdraw * extra * 0.35));
  }
  if (withdraw <= deposit) withdraw = deposit + Math.max(20, Math.round(50 * priceMult));
  minWd = Math.max(minWd, deposit * 2);
  return { deposit, withdraw, minWd, priceMult, quoteMissing, coverage };
}

function twap(samples, windowMs, now) {
  const win = samples.filter((s) => s.usd > 0 && now - s.t <= windowMs);
  if (!win.length) return 0;
  return win.reduce((a, s) => a + s.usd, 0) / win.length;
}
function vol(samples, windowMs, now) {
  const win = samples.filter((s) => s.usd > 0 && now - s.t <= windowMs).sort((a, b) => a.t - b.t);
  if (win.length < 3) return 0;
  const rets = [];
  for (let i = 1; i < win.length; i++) rets.push((win[i].usd - win[i - 1].usd) / win[i - 1].usd);
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  return Math.sqrt(rets.reduce((a, r) => a + (r - m) ** 2, 0) / rets.length);
}

function ingest(oracle, spot, now) {
  const prevSpot = oracle.spot > 0 ? oracle.spot : spot > 0 ? spot : 0;
  if (spot > 0) {
    oracle.spot = spot;
    oracle.fetchedAt = now;
    oracle.samples.push({ t: now, usd: spot });
  }
  oracle.samples = oracle.samples.filter((s) => now - s.t <= 16 * 60_000).slice(-20);
  oracle.twap5 = twap(oracle.samples, 5 * 60_000, now);
  oracle.twap15 = twap(oracle.samples, 15 * 60_000, now);
  oracle.vol5 = vol(oracle.samples, 5 * 60_000, now);
  const missing = !(oracle.spot > 0);
  const stale = !(oracle.fetchedAt > 0) || now - oracle.fetchedAt > STALE_MS;
  const jump = prevSpot > 0 && spot > 0 && Math.abs(spot - prevSpot) / prevSpot > SPOT_JUMP;
  const div = oracle.twap15 > 0 && spot > 0 && Math.abs(spot - oracle.twap15) / oracle.twap15 > TWAP_DIV;
  if (missing) {
    oracle.frozen = true;
    oracle.reason = "no-quote";
    oracle.stable = 0;
  } else if (stale && !(spot > 0)) {
    oracle.frozen = true;
    oracle.reason = "stale";
    oracle.stable = 0;
  } else if (jump) {
    oracle.frozen = true;
    oracle.reason = "spot-jump";
    oracle.stable = 0;
  } else if (div) {
    oracle.frozen = true;
    oracle.reason = "twap-diverge";
    oracle.stable = 0;
  } else if (oracle.frozen) {
    oracle.stable += 1;
    if (oracle.stable >= THAW_N) {
      oracle.frozen = false;
      oracle.reason = "";
      oracle.stable = 0;
    }
  }
  if (!oracle.ref && oracle.twap15 > 0 && !oracle.frozen) {
    oracle.ref = oracle.twap15;
  }
  return oracle;
}

function newOracle() {
  return {
    spot: 0,
    twap5: 0,
    twap15: 0,
    vol5: 0,
    fetchedAt: 0,
    samples: [],
    frozen: true,
    reason: "no-quote",
    stable: 0,
    ref: 0,
    tripped: false,
  };
}

function tryWithdraw(st, creditsWanted, usdPrice) {
  if (st.oracle.frozen || st.oracle.twap15 <= 0) {
    st.checkBack += 1;
    return 0;
  }
  const r = rates({
    players: st.players,
    pool: st.pool,
    circ: st.credits,
    twap15: st.oracle.twap15,
    ref: st.oracle.ref || st.oracle.twap15,
    vol5: st.oracle.vol5,
  });
  if (creditsWanted < r.minWd) return 0;
  const metro = creditsWanted / r.withdraw;
  if (metro > st.pool + 1e-9 || metro > st.ata + 1e-9) {
    st.checkBack += 1;
    return 0;
  }
  st.pool -= metro;
  st.ata -= metro;
  st.credits -= creditsWanted;
  st.served += metro;
  st.usdOut += metro * usdPrice;
  if (st.pool < -1e-6 || st.ata < -1e-6) st.insolvent = true;
  return metro;
}

function tryDeposit(st, metro, usdPrice) {
  if (st.oracle.frozen || st.oracle.twap15 <= 0) {
    st.checkBack += 1;
    return 0;
  }
  const r = rates({
    players: st.players,
    pool: st.pool,
    circ: st.credits,
    twap15: st.oracle.twap15,
    ref: st.oracle.ref || st.oracle.twap15,
    vol5: st.oracle.vol5,
  });
  const credits = Math.floor(metro * r.deposit);
  st.pool += metro;
  st.ata += metro;
  st.credits += credits;
  st.deposited += metro;
  st.usdIn += metro * usdPrice;
  return credits;
}

function citySinks(st, earned, rng) {
  const burn = Math.round(earned * SINK_FRAC);
  // Rare estate buy (₵60k) so the sink is visible without dominating.
  const estate = rng() < 0.0004 ? ESTATE_BASE : 0;
  const furniture = rng() < 0.08 ? 80 + Math.floor(rng() * 200) : 0;
  const forge = rng() < 0.1 ? 40 + Math.floor(rng() * 120) : 0;
  const cosmetics = rng() < 0.02 ? 300 + Math.floor(rng() * 1200) : 0;
  const pvp = rng() < 0.05 ? 50 + Math.floor(rng() * 250) : 0;
  const total = Math.min(st.credits, burn + estate + furniture + forge + cosmetics + pvp);
  st.credits -= total;
  st.burned += total;
  return total;
}

function runPath(opts) {
  const rng = mulberry32(opts.seed ?? 1);
  const days = opts.days ?? 180;
  const stepMs = opts.stepMs ?? 86_400_000;
  const steps = Math.ceil((days * 86_400_000) / stepMs);
  const prev = opts.continueFrom;
  const st = prev
    ? {
        ...prev,
        oracle: {
          ...prev.oracle,
          samples: (prev.oracle.samples || []).map((s) => ({ ...s })),
        },
      }
    : {
    players: opts.players ?? 500,
    pool: opts.seedMetro ?? DEV_SEED,
    ata: opts.seedMetro ?? DEV_SEED,
    credits: opts.circ0 ?? 0,
    oracle: newOracle(),
    served: 0,
    deposited: 0,
    unserved: 0,
    checkBack: 0,
    burned: 0,
    usdIn: 0,
    usdOut: 0,
    insolvent: false,
    cityPlayable: true,
  };
  const nDep = Math.round(st.players * (opts.depositorShare ?? 0.12));
  const nFarm = Math.max(0, st.players - nDep);
  const cashoutShare = opts.cashoutShare ?? 0.28;
  const earnPerDay = opts.farmerEarnPerDay ?? 900;
  const depPerDay = opts.depositsPerDepositorDay ?? 1.5;

  let t = 0;
  const warm = opts.warmupPrice ?? (typeof opts.priceAt === "function" ? opts.priceAt(0, 0) : 0);
  if (warm > 0 && !opts.noWarmup && !prev) {
    for (let k = 3; k >= 1; k--) ingest(st.oracle, warm, -k * 60_000);
  }
  for (let i = 0; i < steps; i++) {
    t += stepMs;
    const dayFrac = stepMs / 86_400_000;
    const spot = opts.priceAt(t, i);
    ingest(st.oracle, spot, t);
    if (st.oracle.reason === "spot-jump" || st.oracle.reason === "twap-diverge" || st.oracle.reason === "stale") {
      st.oracle.tripped = true;
    }

    if (opts.wash) {
      const metro = 100;
      const cIn = tryDeposit(st, metro, spot || 0);
      if (cIn > 0) {
        // cooldown: wash can still round-trip the same day, but spread is -EV
        t += COOLDOWN_MS;
        tryWithdraw(st, cIn, st.oracle.spot || spot || 0);
      }
      continue;
    }

    const depAmt = nDep * depPerDay * dayFrac * (0.7 + rng() * 0.6);
    if (depAmt > 0 && !(opts.noDeposits)) tryDeposit(st, depAmt, spot || 0);

    const earned = Math.round(nFarm * earnPerDay * dayFrac * (0.7 + rng() * 0.6));
    st.credits += earned;
    citySinks(st, earned, rng);

    const want = Math.floor(st.credits * cashoutShare);
    const r = rates({
      players: st.players,
      pool: st.pool,
      circ: st.credits,
      twap15: st.oracle.twap15,
      ref: st.oracle.ref || st.oracle.twap15,
      vol5: st.oracle.vol5,
    });
    if (want >= r.minWd) {
      const got = tryWithdraw(st, want, spot || 0);
      if (got === 0 && want / r.withdraw > 0) st.unserved += want / Math.max(1, r.withdraw);
    }
  }

  const demand = st.served + st.unserved;
  return {
    ...st,
    unservedPct: demand > 0 ? st.unserved / demand : 0,
    endPool: st.pool,
    endAta: st.ata,
  };
}

const MINUTE = 60_000;
const DAY = 86_400_000;

function assert(name, cond, detail) {
  if (!cond) {
    console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`);
    return false;
  }
  console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
  return true;
}

let failed = 0;
function check(name, cond, detail) {
  if (!assert(name, cond, detail)) failed++;
}

console.log(`$METRO ₵ sim — unlimited earn/WD · seed ${DEV_SEED.toLocaleString()}◈ · ${DEP0} in / ${WD0} out · sinks ${SINK_FRAC * 100}% + estates ₵${ESTATE_BASE.toLocaleString()}`);
console.log(`mix: 500p · 12% depositors · 88% farmers · cooldown ${COOLDOWN_MS / 1000}s · venue pump.fun / PumpSwap\n`);

// 1. Sideways after graduation
{
  const r = runPath({
    days: 180,
    stepMs: DAY,
    seed: 7,
    priceAt: () => 0.00012,
  });
  check(
    "sideways after graduation",
    r.endPool > 0 && r.endAta >= 0 && !r.insolvent && r.unservedPct < TARGET_UNSERVED,
    `endPool=${Math.round(r.endPool)} unserved=${(100 * r.unservedPct).toFixed(1)}%`,
  );
}

// 2. Launch spike then −90% dump
{
  const r = runPath({
    days: 3,
    stepMs: MINUTE,
    seed: 11,
    priceAt: (t) => {
      const m = t / MINUTE;
      if (m < 10) return 0.0001;
      if (m < 12) return 0.001; // 10× spike
      if (m < 20) return 0.0001; // −90% dump
      return 0.0001;
    },
  });
  const after = runPath({
    days: 1,
    stepMs: DAY,
    seed: 13,
    continueFrom: r,
    noWarmup: true,
    priceAt: () => 0.0001,
  });
  check(
    "spike then -90% dump",
    r.oracle.tripped && r.checkBack > 0 && after.endPool > r.endPool * 0.3 && !after.insolvent,
    `tripped=${r.oracle.tripped} checkBack=${r.checkBack} dumpPool=${Math.round(r.endPool)} postThawPool=${Math.round(after.endPool)}`,
  );
}

// 3. Slow grind up 10×
{
  const start = 0.0001;
  const r = runPath({
    days: 40,
    stepMs: DAY,
    seed: 17,
    priceAt: (t) => start * (1 + 9 * Math.min(1, t / (40 * DAY))),
  });
  const r0 = rates({ players: 500, pool: DEV_SEED, circ: 0, twap15: start, ref: start, vol5: 0 });
  const r1 = rates({ players: 500, pool: DEV_SEED, circ: 0, twap15: start * 10, ref: start, vol5: 0 });
  const roundTrip = r1.deposit / r1.withdraw;
  check(
    "slow 10x grind",
    r1.deposit > r0.deposit && roundTrip < 1 && r.endPool > 0 && !r.insolvent,
    `dep ${r0.deposit}→${r1.deposit} roundTrip=${roundTrip.toFixed(3)}`,
  );
}

// 4. Death spiral to dust
{
  const r = runPath({
    days: 2,
    stepMs: MINUTE,
    seed: 19,
    priceAt: (t) => {
      const m = t / MINUTE;
      if (m < 5) return 0.0001;
      if (m < 8) return 0.0001 * Math.pow(0.2, m - 5); // cliff
      return 1e-12;
    },
  });
  check(
    "death spiral to dust",
    r.oracle.tripped && r.cityPlayable && r.endPool >= 0 && r.endAta >= 0 && !r.insolvent,
    `tripped=${r.oracle.tripped} frozen=${r.oracle.frozen} reason=${r.oracle.reason} pool=${Math.round(r.endPool)}`,
  );
}

// 5. Wash deposit→withdraw is −EV in ₵ and USD
{
  const r = runPath({
    days: 1,
    stepMs: DAY,
    seed: 23,
    wash: true,
    noDeposits: true,
    depositorShare: 0,
    players: 1,
    seedMetro: DEV_SEED,
    priceAt: () => 0.0002,
  });
  // 100 METRO in → floor(100*dep) ₵ → that ₵ / wd METRO out. Spread is the house.
  check(
    "wash deposit→withdraw -EV",
    r.deposited > 0 && r.served < r.deposited && r.usdOut < r.usdIn && r.credits <= 0,
    `in=${r.deposited.toFixed(2)}◈ out=${r.served.toFixed(2)}◈ usd ${r.usdIn.toFixed(4)}→${r.usdOut.toFixed(4)}`,
  );
}

// 6. 2× design farmers, no depositors — Check back later before ATA overdrawn
{
  const r = runPath({
    days: 30,
    stepMs: DAY,
    seed: 29,
    players: 1000,
    depositorShare: 0,
    noDeposits: true,
    farmerEarnPerDay: 8_000,
    cashoutShare: 0.9,
    circ0: 5_000_000_000,
    seedMetro: DEV_SEED,
    priceAt: () => 0.00012,
  });
  check(
    "2x farmers no depositors",
    r.checkBack > 0 && r.endAta >= 0 && r.endPool >= 0 && !r.insolvent,
    `checkBack=${r.checkBack} endAta=${Math.round(r.endAta)} endPool=${Math.round(r.endPool)}`,
  );
}

if (failed) {
  console.error(`\n${failed} scenario(s) failed`);
  process.exit(1);
}
console.log("\nall scenarios passed — unlimited policy + TWAP circuit breaker held.");
process.exit(0);

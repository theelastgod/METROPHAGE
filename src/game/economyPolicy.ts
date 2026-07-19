// METROPHAGE — shared P2E economy policy (client display + server authority).
//
// Baseline: ~500 players, 1% dev seed (10M $METRO) + player deposits − withdrawals.
// When registered players *exceed* 500 / 1000 / 1500 / 2500, bridge *rates* tighten
// so the seed + pool stay solvent — but there is NO daily earn cap and NO daily
// withdraw cap. Players may earn and cash out as much as the pool can cover.
//
// Hard brakes only:
//   • pool empty/short → "Check back later."
//   • min withdraw floor + short anti-spam cooldown
//   • optional wider spread at higher population tiers
//
// On-chain $METRO USD price (EVM) scales credits-per-$METRO rates so the bridge
// tracks market value. Reference design assumes ~$1 / $METRO at launch.

/** Fixed total $METRO supply (human units; mint decimals may differ on-chain). */
export const METRO_TOTAL_SUPPLY = 1_000_000_000;
/** Developer treasury seed into the cash-out pool at launch. */
export const METRO_DEV_SEED_FRAC = 0.01;
export const METRO_DEV_SEED_METRO = Math.round(METRO_TOTAL_SUPPLY * METRO_DEV_SEED_FRAC); // 10M
/** Launch design population (tier 0 ceiling). */
export const TARGET_PLAYERS = 500;
/**
 * Soft P2E design budget: ~10% of supply for lifetime convertibility math
 * (not a second on-chain allocation — pool still only pays from seed+deposits).
 */
export const METRO_P2E_DESIGN_POOL = Math.round(METRO_TOTAL_SUPPLY * 0.1);
export const METRO_PER_PLAYER_LIFETIME_BUDGET = Math.round(METRO_P2E_DESIGN_POOL / TARGET_PLAYERS); // 200k

// ── Base bridge rates (healthy, ≤500 players) ────────────────────────────
export const BASE_DEPOSIT_CREDITS = 100;
export const BASE_WITHDRAW_CREDITS = 150; // ~33% round-trip retained
export const BASE_MIN_WITHDRAW_CREDITS = 300;
/** @deprecated No daily withdraw cap — kept as 0 (= unlimited) for API compat. */
export const BASE_DAILY_WITHDRAW_CREDITS = 0;
/** @deprecated No daily earn cap — kept as 0 (= unlimited) for API compat. */
export const BASE_DAILY_EMIT_CAP = 0;
/** Short anti-spam gap between withdraw requests (not a daily limit). */
export const BASE_WITHDRAW_COOLDOWN_MS = 30_000;

// ── Population tiers (rate pressure only — never daily earn/WD caps) ─────
//
// | Players   | Tier   | WD rate | Deposit | CD  |
// |-----------|--------|---------|---------|-----|
// | ≤500      | launch | 150     | 100     | 30s |
// | 501–1000  | growth | 160     | 100     | 35s |
// | 1001–1500 | scale  | 170     | 95      | 40s |
// | 1501–2500 | mass   | 185     | 90      | 45s |
// | 2501+     | mega   | 200     | 85      | 50s |

export type PopTierId = "launch" | "growth" | "scale" | "mass" | "mega";

export interface PopTier {
  id: PopTierId;
  /** Inclusive max players for this tier (Infinity for mega). */
  maxPlayers: number;
  label: string;
  /** Absolute withdraw credits-per-$METRO (higher = harder cash-out). */
  withdrawCreditsPerMetro: number;
  /** Absolute deposit credits-per-$METRO (lower = less ₵ per deposit). */
  depositCreditsPerMetro: number;
  withdrawCooldownMs: number;
  minWithdrawCredits: number;
  blurb: string;
}

/** Ordered ascending by maxPlayers. First tier where players ≤ maxPlayers wins. */
export const POP_TIERS: readonly PopTier[] = [
  {
    id: "launch",
    maxPlayers: 500,
    label: "Launch (≤500)",
    withdrawCreditsPerMetro: 150,
    depositCreditsPerMetro: 100,
    withdrawCooldownMs: 30_000,
    minWithdrawCredits: 300,
    blurb: "Unlimited earn & cash-out (pool permitting). Baseline bridge spread.",
  },
  {
    id: "growth",
    maxPlayers: 1000,
    label: "Growth (501–1000)",
    withdrawCreditsPerMetro: 160,
    depositCreditsPerMetro: 100,
    withdrawCooldownMs: 35_000,
    minWithdrawCredits: 320,
    blurb: "Slightly wider cash-out spread — still unlimited daily earn/WD.",
  },
  {
    id: "scale",
    maxPlayers: 1500,
    label: "Scale (1001–1500)",
    withdrawCreditsPerMetro: 170,
    depositCreditsPerMetro: 95,
    withdrawCooldownMs: 40_000,
    minWithdrawCredits: 340,
    blurb: "Deposits mint fewer ₵; cash-outs cost more ₵ per $METRO.",
  },
  {
    id: "mass",
    maxPlayers: 2500,
    label: "Mass (1501–2500)",
    withdrawCreditsPerMetro: 185,
    depositCreditsPerMetro: 90,
    withdrawCooldownMs: 45_000,
    minWithdrawCredits: 370,
    blurb: "Wider spread for a large farmer base — no daily earn/WD caps.",
  },
  {
    id: "mega",
    maxPlayers: Number.POSITIVE_INFINITY,
    label: "Mega (2501+)",
    withdrawCreditsPerMetro: 200,
    depositCreditsPerMetro: 85,
    withdrawCooldownMs: 50_000,
    minWithdrawCredits: 400,
    blurb: "Maximum rate pressure — earn/cash-out still unlimited vs the pool.",
  },
] as const;

export const POP_THRESHOLDS = [500, 1000, 1500, 2500] as const;

export function populationTier(playerCount: number): PopTier {
  const n = Math.max(0, Math.floor(playerCount || 0));
  for (const t of POP_TIERS) {
    if (n <= t.maxPlayers) return t;
  }
  return POP_TIERS[POP_TIERS.length - 1];
}

/**
 * Ceiling of the current tier (500 / 1000 / 1500 / 2500), or null if already mega.
 * Crossing above this value steps bridge rates into the next tier.
 */
export function nextPopThreshold(playerCount: number): number | null {
  const n = Math.max(0, Math.floor(playerCount || 0));
  for (const t of POP_THRESHOLDS) {
    if (n <= t) return t;
  }
  return null;
}

/** @deprecated use nextPopThreshold */
export const nextPopThresholdClean = nextPopThreshold;

export type EconomyPhase = "bootstrap" | "healthy" | "stress" | "crisis";

export interface EconomyPolicy {
  phase: EconomyPhase;
  depositCreditsPerMetro: number;
  withdrawCreditsPerMetro: number;
  minWithdrawCredits: number;
  /**
   * Daily personal withdraw cap in credits. **Always 0 = unlimited.**
   * Kept for API/UI backward compatibility.
   */
  dailyWithdrawCapCredits: number;
  /**
   * Daily emit (earn) cap in credits. **Always 0 = unlimited.**
   * Kept for API/UI backward compatibility.
   */
  dailyEmitCap: number;
  withdrawCooldownMs: number;
  /**
   * Remaining global daily withdraw allowance in $METRO.
   * **Always a huge number** — no global daily drain cap.
   */
  globalDailyWithdrawMetro: number;
  coverageRatio: number | null;
  poolMetro: number;
  targetPlayers: number;
  activePlayers: number;
  popTier: PopTierId;
  popTierLabel: string;
  nextPopThreshold: number | null;
  devSeedMetro: number;
  note: string;
  /** Live market USD per 1 $METRO (EVM). Reference = 1 when unlisted. */
  metroUsd: number;
  /** deposit/withdraw rates scaled by metroUsd / reference. */
  priceMult: number;
  priceSource: string;
  priceStale: boolean;
}

export interface EconomySnapshot {
  poolMetro: number;
  circulatingCredits: number;
  activePlayers?: number;
  seedMetro?: number;
  /** Ignored — no global daily WD cap. */
  withdrawnTodayMetro?: number;
  /**
   * Market USD price of 1 $METRO on the settlement chain.
   * When omitted / invalid, rates use the design reference ($1).
   */
  metroUsd?: number;
  /** Design reference USD for $METRO (default 1). */
  metroUsdReference?: number;
  priceSource?: string;
  priceStale?: boolean;
}

/** Design reference: base pop-tier rates assume ~$1 per $METRO. */
export const METRO_USD_REFERENCE_DEFAULT = 1.0;
export const METRO_PRICE_MULT_MIN = 0.25;
export const METRO_PRICE_MULT_MAX = 8;

/** Multiplier applied to base credits-per-$METRO rates from market USD. */
export function metroPriceMultiplier(usd: number, ref = METRO_USD_REFERENCE_DEFAULT): number {
  if (!Number.isFinite(usd) || usd <= 0) return 1;
  const r = ref > 0 ? ref : 1;
  return clamp(usd / r, METRO_PRICE_MULT_MIN, METRO_PRICE_MULT_MAX);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function roundMetro(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function creditsToMetroAt(credits: number, withdrawRate: number): number {
  return roundMetro(credits / Math.max(1, withdrawRate));
}

/**
 * Resolve live bridge rates from pool health + population tier + market USD price.
 * Does **not** impose daily earn or daily withdraw caps.
 *
 * Market USD (EVM): scales both deposit and withdraw credits-per-$METRO by the
 * same multiplier so the spread ratio stays intact while absolute ₵ tracks token value.
 *   mult = clamp(metroUsd / $1_ref, 0.25, 8)
 * Example: $2 $METRO → ~2× credits per token in both directions.
 */
export function resolveEconomyPolicy(snap: EconomySnapshot): EconomyPolicy {
  const pool = Math.max(0, snap.poolMetro || 0);
  const circ = Math.max(0, snap.circulatingCredits || 0);
  const players = clamp(Math.floor(snap.activePlayers ?? TARGET_PLAYERS), 1, 100_000);
  const seed = snap.seedMetro ?? METRO_DEV_SEED_METRO;
  const tier = populationTier(players);
  const ref = snap.metroUsdReference ?? METRO_USD_REFERENCE_DEFAULT;
  const metroUsd =
    Number.isFinite(snap.metroUsd) && (snap.metroUsd as number) > 0
      ? (snap.metroUsd as number)
      : ref;
  const priceMult = metroPriceMultiplier(metroUsd, ref);
  const priceSource = snap.priceSource ?? (snap.metroUsd != null ? "market" : "reference");
  const priceStale = !!snap.priceStale;

  let deposit = tier.depositCreditsPerMetro;
  let withdraw = tier.withdrawCreditsPerMetro;
  let minWd = tier.minWithdrawCredits;
  let cooldown = tier.withdrawCooldownMs;
  let phase: EconomyPhase = pool > 0 ? "healthy" : "bootstrap";

  // Apply market price to base tier rates first (then stress may widen the spread).
  deposit = Math.round(deposit * priceMult);
  withdraw = Math.round(withdraw * priceMult);
  minWd = Math.round(minWd * priceMult);

  let coverage: number | null = null;
  const liability = circ / Math.max(1, withdraw);
  if (liability > 0) coverage = pool / liability;

  if (pool <= 0) {
    phase = "bootstrap";
  } else if (coverage != null && coverage < 0.15) {
    // Crisis: widen spread only — still no daily caps.
    phase = "crisis";
    deposit = Math.min(deposit, Math.round(85 * priceMult));
    withdraw = Math.max(withdraw, Math.round(200 * priceMult));
    minWd = Math.max(minWd, Math.round(400 * priceMult));
    cooldown = Math.max(cooldown, 45_000);
  } else if (coverage != null && coverage < 0.4) {
    phase = "stress";
    deposit = Math.min(deposit, Math.round(95 * priceMult));
    withdraw = Math.max(withdraw, Math.round(175 * priceMult));
    minWd = Math.max(minWd, Math.round(350 * priceMult));
    cooldown = Math.max(cooldown, 35_000);
  } else {
    phase = pool >= creditsToMetroAt(minWd, withdraw) ? "healthy" : "bootstrap";
  }

  // Soft clamps after price scale — keep a positive spread.
  const loDep = Math.max(20, Math.round(70 * Math.min(1, priceMult)));
  const hiDep = Math.round(120 * Math.max(1, priceMult) * 1.5);
  const loWd = Math.max(30, Math.round(125 * Math.min(1, priceMult)));
  const hiWd = Math.round(220 * Math.max(1, priceMult) * 1.5);
  deposit = clamp(deposit, loDep, hiDep);
  withdraw = clamp(withdraw, loWd, hiWd);
  if (withdraw <= deposit) withdraw = deposit + Math.max(20, Math.round(50 * priceMult));
  minWd = Math.max(minWd, deposit * 2);

  const nextTh = nextPopThreshold(players);
  const noteParts = [
    `pop ${players} · ${tier.label}`,
    phase,
    "unlimited earn · unlimited daily WD",
    `seed ${seed.toLocaleString()}◈`,
    `◈≈$${metroUsd.toFixed(metroUsd >= 1 ? 2 : 4)} (${priceSource}${priceStale ? ",stale" : ""})`,
    `rate×${priceMult.toFixed(2)}`,
  ];
  if (nextTh != null) noteParts.push(`next rate tier >${nextTh}`);

  return {
    phase,
    depositCreditsPerMetro: deposit,
    withdrawCreditsPerMetro: withdraw,
    minWithdrawCredits: minWd,
    dailyWithdrawCapCredits: 0, // unlimited
    dailyEmitCap: 0, // unlimited
    withdrawCooldownMs: cooldown,
    // Effectively unlimited global daily WD (pool balance is the real limit).
    globalDailyWithdrawMetro: Number.MAX_SAFE_INTEGER / 4,
    coverageRatio: coverage == null ? null : Math.round(coverage * 1000) / 1000,
    poolMetro: pool,
    targetPlayers: TARGET_PLAYERS,
    activePlayers: players,
    popTier: tier.id,
    popTierLabel: tier.label,
    nextPopThreshold: nextTh,
    devSeedMetro: seed,
    note: noteParts.join(" · ") + " — " + tier.blurb,
    metroUsd,
    priceMult,
    priceSource,
    priceStale,
  };
}

export function defaultEconomyPolicy(): EconomyPolicy {
  return resolveEconomyPolicy({
    poolMetro: METRO_DEV_SEED_METRO,
    circulatingCredits: 0,
    activePlayers: TARGET_PLAYERS,
    seedMetro: METRO_DEV_SEED_METRO,
  });
}

export function popTierSummaryTable(): string {
  const rows = POP_TIERS.map((t) => {
    const range =
      t.id === "launch"
        ? "1–500"
        : t.id === "growth"
          ? "501–1000"
          : t.id === "scale"
            ? "1001–1500"
            : t.id === "mass"
              ? "1501–2500"
              : "2501+";
    return `| ${range} | ${t.id} | unlimited | unlimited | ${t.depositCreditsPerMetro} in / ${t.withdrawCreditsPerMetro} out |`;
  });
  return [
    "| Players | Tier | Daily emit | Daily WD | Bridge rates |",
    "|---------|------|------------|----------|--------------|",
    ...rows,
  ].join("\n");
}

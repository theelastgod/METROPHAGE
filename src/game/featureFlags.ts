// METROPHAGE — launch kill switches + capacity caps (pure data).
// Server reads env vars (METRO_DISABLE_*, METRO_HUB_CAP, METRO_DAILY_EMIT_CAP).
// Default: everything ON, safe defaults for launch.

export interface LaunchFlags {
  /** Auction house list/buy/browse. */
  market: boolean;
  /** Cell weekly goal claim. */
  claimGoal: boolean;
  /** District war capture bonuses. */
  districtWar: boolean;
  /** Soft max concurrent players in hub ("safe") before redirect to d0. */
  hubCap: number;
  /**
   * Legacy env knob. **0 = unlimited** (default). Earn from play is uncapped;
   * only the cash-out pool limits convertibility.
   */
  dailyEmitCap: number;
}

export const DEFAULT_LAUNCH_FLAGS: LaunchFlags = {
  market: true,
  claimGoal: true,
  districtWar: true,
  hubCap: 48,
  // Unlimited earn from play (0). Env METRO_DAILY_EMIT_CAP can still set a ceiling if needed.
  dailyEmitCap: 0,
};

/** `METRO_DISABLE_X=1` (or true/on/yes/off) turns that feature OFF. */
export function isFeatureDisabled(v: string | undefined): boolean {
  if (v === undefined || v === "") return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes" || s === "off";
}

export function parseIntEnv(v: string | undefined, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Build flags from Cloudflare env (or test doubles). */
export function launchFlagsFromEnv(env: {
  METRO_DISABLE_MARKET?: string;
  METRO_DISABLE_CLAIM_GOAL?: string;
  METRO_DISABLE_DISTRICT_WAR?: string;
  METRO_HUB_CAP?: string;
  METRO_DAILY_EMIT_CAP?: string;
}): LaunchFlags {
  return {
    market: !isFeatureDisabled(env.METRO_DISABLE_MARKET),
    claimGoal: !isFeatureDisabled(env.METRO_DISABLE_CLAIM_GOAL),
    districtWar: !isFeatureDisabled(env.METRO_DISABLE_DISTRICT_WAR),
    hubCap: parseIntEnv(env.METRO_HUB_CAP, DEFAULT_LAUNCH_FLAGS.hubCap, 8, 200),
    // 0 = unlimited; if set, allow 0–1e9 for ops emergencies only.
    dailyEmitCap: parseIntEnv(env.METRO_DAILY_EMIT_CAP, DEFAULT_LAUNCH_FLAGS.dailyEmitCap, 0, 1_000_000_000),
  };
}

/** UTC day key for emit tracking. */
export function emitDayKey(now = Date.now()): string {
  return `emit_${Math.floor(now / 86_400_000)}`;
}

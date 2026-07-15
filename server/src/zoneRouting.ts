/**
 * Zone instance routing — horizontal scale for hot Durable Object zones.
 *
 * DO identity:
 *   instance 0 → idFromName(zone)          e.g. "safe", "d0"  (legacy-compatible)
 *   instance N → idFromName(`${zone}#${N}`) e.g. "d0#2"
 *
 * Logical game zone stays `zone` (grid, spawns, combat). Instance only shards
 * concurrent players across independent sims of the same map.
 */

import { parseIntEnv, type LaunchFlags } from "../../src/game/featureFlags";

/** Env knobs for instance capacity (Worker + WorldDO). */
export type InstanceEnv = {
  METRO_MAX_INSTANCES?: string;
  METRO_INSTANCE_CAP?: string;
  METRO_HUB_CAP?: string;
};

export type InstanceLoad = {
  inst: number;
  players: number;
  /** Optional tick cost — prefer cooler instances when player counts tie. */
  tickMsAvg?: number;
  /** When true, probe failed; treat as empty/cold. */
  error?: boolean;
};

/** Zones that may be horizontally sharded under load. */
export function isShardableZone(zone: string | null | undefined): boolean {
  if (!zone) return false;
  if (zone === "safe" || zone === "subway") return true;
  // Combat districts only (d0…dN) — not d0i3 building interiors.
  return /^d\d+$/.test(zone);
}

/** Durable Object name for (logical zone, instance index). Instance 0 keeps legacy name. */
export function doName(zone: string, inst: number): string {
  const i = Math.max(0, Math.floor(Number(inst) || 0));
  return i === 0 ? zone : `${zone}#${i}`;
}

/** Parse a DO name back to logical zone + instance. */
export function parseDoName(name: string | null | undefined): { zone: string; inst: number } {
  if (!name) return { zone: "d0", inst: 0 };
  const m = /^(.+)#(\d+)$/.exec(name);
  if (m) {
    return { zone: m[1], inst: Math.max(0, parseInt(m[2], 10) || 0) };
  }
  return { zone: name, inst: 0 };
}

/** Max instances allowed for a zone (1 for non-shardable). */
export function maxInstancesFor(zone: string, env: InstanceEnv = {}): number {
  if (!isShardableZone(zone)) return 1;
  // Cap 1–16; default 4 so hot hubs/districts can split without unbounded DO spawn.
  return parseIntEnv(env.METRO_MAX_INSTANCES, 4, 1, 16);
}

/**
 * Whether bouncing a full instance can actually land the player somewhere else.
 *
 * A zone with a single instance has no other slice — the front door would route
 * a "rebalance" straight back to the same DO, so rejecting there is a closed
 * door, not a rebalance. Callers must admit (spill) instead of rejecting when
 * this is false, matching pickInstance's "better than rejecting the player".
 */
export function canRebalanceZone(zone: string, env: InstanceEnv = {}): boolean {
  return isShardableZone(zone) && maxInstancesFor(zone, env) > 1;
}

/**
 * Soft concurrent target per instance — balancer prefers instances under this.
 * Hub uses METRO_HUB_CAP; combat/subway use METRO_INSTANCE_CAP (default 40).
 */
export function softCapFor(zone: string, env: InstanceEnv = {}, flags?: Pick<LaunchFlags, "hubCap">): number {
  if (zone === "safe") {
    return flags?.hubCap ?? parseIntEnv(env.METRO_HUB_CAP, 48, 8, 200);
  }
  return parseIntEnv(env.METRO_INSTANCE_CAP, 40, 8, 200);
}

/**
 * Hard reject threshold inside a DO (race with balancer). Slightly above soft so
 * sticky reconnects can land; balancer still tries to fill under soft first.
 */
export function hardCapFor(zone: string, env: InstanceEnv = {}, flags?: Pick<LaunchFlags, "hubCap">): number {
  const soft = softCapFor(zone, env, flags);
  // +8 headroom for reconnect races / party stickiness.
  return Math.min(200, soft + 8);
}

/**
 * Pick the best instance index given load samples.
 *
 * Priority:
 *  1. Sticky inst if under hard cap
 *  2. Least-loaded instance under soft cap (prefer warm rooms with room)
 *  3. Least-loaded under hard cap
 *  4. Global least-loaded (spill — better than rejecting the player)
 */
export function pickInstance(
  loads: InstanceLoad[],
  opts: {
    sticky?: number | null;
    softCap: number;
    hardCap: number;
    maxInst: number;
  },
): number {
  const maxInst = Math.max(1, opts.maxInst);
  const soft = Math.max(1, opts.softCap);
  const hard = Math.max(soft, opts.hardCap);

  // Normalize / pad missing instances as empty cold rooms.
  const byInst = new Map<number, InstanceLoad>();
  for (const L of loads) {
    if (L.inst >= 0 && L.inst < maxInst) byInst.set(L.inst, L);
  }
  const all: InstanceLoad[] = [];
  for (let i = 0; i < maxInst; i++) {
    all.push(byInst.get(i) ?? { inst: i, players: 0, tickMsAvg: 0 });
  }

  const sticky = opts.sticky;
  if (sticky != null && Number.isFinite(sticky)) {
    const s = Math.floor(sticky);
    if (s >= 0 && s < maxInst) {
      const row = all[s];
      if ((row.players ?? 0) < hard) return s;
    }
  }

  const score = (L: InstanceLoad) => {
    // Lower is better. Tick cost breaks ties so hot DOs shed load.
    const t = Number(L.tickMsAvg) || 0;
    return (L.players ?? 0) * 1000 + t;
  };

  // A failed probe reports 0 players — which would SCORE BEST and drain every
  // joiner into an instance we know nothing about (it may be full, or down).
  // An unknown room is not an empty room: only consider these if nothing else
  // answered, where a blind pick still beats no pick.
  const known = all.filter((L) => !L.error);
  const pool = known.length ? known : all;

  const underSoft = pool.filter((L) => (L.players ?? 0) < soft);
  if (underSoft.length) {
    underSoft.sort((a, b) => score(a) - score(b) || a.inst - b.inst);
    return underSoft[0].inst;
  }

  const underHard = pool.filter((L) => (L.players ?? 0) < hard);
  if (underHard.length) {
    underHard.sort((a, b) => score(a) - score(b) || a.inst - b.inst);
    return underHard[0].inst;
  }

  const spill = [...pool].sort((a, b) => score(a) - score(b) || a.inst - b.inst);
  return spill[0].inst;
}

/** Parse ?inst= query (undefined if absent / invalid). */
export function parseInstParam(raw: string | null | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0 || n > 64) return undefined;
  return n;
}

// /economy — the game's economic dashboard: reward emissions vs sinks, how the
// circulating credit supply relates to the $METRO treasury, and a deposit
// forecast fit on the bridge's real history.
//
// Sources: economy_daily (per-zone credit flows tallied by the WorldDO ledger),
// players.credits (circulating supply), metro_deposits / metro_withdrawals
// (bridge history). Everything is expressed BOTH in credits and in $METRO at
// the bridge's fixed withdraw rate, so reward emission is directly comparable
// to token liability.

import { BRIDGE, poolMetro, seedMetro, resolveBridge } from "./metro";
import { METRO_DEV_SEED_METRO, TARGET_PLAYERS } from "../../src/game/economyPolicy";

const DAY_MS = 86_400_000;
const dayStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface FlowRow {
  day: string;
  flow: string;
  kind: string;
  credits: number;
}

/** Exponentially-weighted daily average over (possibly gappy) per-day sums. */
function ewma(byDay: Map<string, number>, days: number, alpha = 0.35): number {
  let avg = 0;
  let seeded = false;
  for (let i = days - 1; i >= 0; i--) {
    const v = byDay.get(dayStr(Date.now() - i * DAY_MS)) ?? 0;
    if (!seeded) {
      avg = v;
      seeded = true;
    } else {
      avg += alpha * (v - avg);
    }
  }
  return avg;
}

export async function handleEconomy(env: { DB: D1Database }): Promise<Response> {
  const db = env.DB;
  const since = dayStr(Date.now() - 13 * DAY_MS);

  const [flows, circ, pool, deps, wds] = await Promise.all([
    db
      .prepare("SELECT day, flow, kind, SUM(credits) AS credits FROM economy_daily WHERE day >= ? GROUP BY day, flow, kind")
      .bind(since)
      .all<FlowRow>()
      .catch(() => ({ results: [] as FlowRow[] })), // pre-migration: report zeros, don't 500
    db.prepare("SELECT COALESCE(SUM(credits),0) AS c, COUNT(*) AS n FROM players").first<{ c: number; n: number }>(),
    poolMetro(db),
    db
      .prepare("SELECT created_at, metro FROM metro_deposits WHERE created_at >= ?")
      .bind(Date.now() - 14 * DAY_MS)
      .all<{ created_at: number; metro: number }>(),
    db
      .prepare("SELECT created_at, metro FROM metro_withdrawals WHERE status != 'failed' AND created_at >= ?")
      .bind(Date.now() - 14 * DAY_MS)
      .all<{ created_at: number; metro: number }>(),
  ]);

  // ── reward emissions + sinks (today / trailing 7 days, by kind) ──
  const today = dayStr(Date.now());
  const week = dayStr(Date.now() - 6 * DAY_MS);
  const sum = (flow: string, fromDay: string) =>
    (flows.results ?? []).filter((r) => r.flow === flow && r.day >= fromDay).reduce((a, r) => a + r.credits, 0);
  const byKind = (flow: string, fromDay: string) => {
    const out: Record<string, number> = {};
    for (const r of (flows.results ?? []).filter((r) => r.flow === flow && r.day >= fromDay)) {
      out[r.kind] = (out[r.kind] ?? 0) + r.credits;
    }
    return out;
  };
  const emitByDay = new Map<string, number>();
  for (const r of flows.results ?? []) {
    if (r.flow === "emit") emitByDay.set(r.day, (emitByDay.get(r.day) ?? 0) + r.credits);
  }

  // ── bridge history → per-day sums → EWMA forecast ──
  const toByDay = (rows: Array<{ created_at: number; metro: number }>) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const d = dayStr(r.created_at);
      m.set(d, (m.get(d) ?? 0) + r.metro);
    }
    return m;
  };
  const depByDay = toByDay(deps.results ?? []);
  const wdByDay = toByDay(wds.results ?? []);
  const depositsPerDay = ewma(depByDay, 14);
  const withdrawalsPerDay = ewma(wdByDay, 14);
  const netPoolPerDay = depositsPerDay - withdrawalsPerDay;

  const live = await resolveBridge(db, {
    METRO_MINT: (env as { METRO_MINT?: string }).METRO_MINT,
    METRO_DEVNET_MINT: (env as { METRO_DEVNET_MINT?: string }).METRO_DEVNET_MINT,
    METRO_CHAIN_ID: (env as { METRO_CHAIN_ID?: string }).METRO_CHAIN_ID,
    METRO_RPC: (env as { METRO_RPC?: string }).METRO_RPC,
    METRO_USD_PRICE: (env as { METRO_USD_PRICE?: string }).METRO_USD_PRICE,
    METRO_MAINNET_ARMED: (env as { METRO_MAINNET_ARMED?: string }).METRO_MAINNET_ARMED,
  }).catch(() => null);
  const rate = live?.withdrawCreditsPerMetro ?? BRIDGE.withdrawCreditsPerMetro;
  const circulating = circ?.c ?? 0;
  const impliedLiabilityMetro = Math.round((circulating / rate) * 100) / 100;
  const emit7 = sum("emit", week);
  const burn7 = sum("burn", week);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const seed = await seedMetro(db);

  return new Response(
    JSON.stringify({
      ok: true,
      asOf: new Date().toISOString(),
      credits: {
        circulating,
        players: circ?.n ?? 0,
        emittedToday: sum("emit", today),
        burnedToday: sum("burn", today),
        emitted7d: emit7,
        burned7d: burn7,
        sinkEfficiency7d: emit7 > 0 ? r2(burn7 / emit7) : null,
        emitByKind7d: byKind("emit", week),
        burnByKind7d: byKind("burn", week),
        dailyEmitCap: live?.policy.dailyEmitCap ?? null,
      },
      token: {
        rateCreditsPerMetro: rate,
        depositCreditsPerMetro: live?.depositCreditsPerMetro ?? BRIDGE.depositCreditsPerMetro,
        poolMetro: pool,
        seedMetro: seed,
        designSeedMetro: METRO_DEV_SEED_METRO,
        targetPlayers: TARGET_PLAYERS,
        activePlayers: live?.policy.activePlayers ?? circ?.n ?? null,
        popTier: live?.policy.popTier ?? null,
        popTierLabel: live?.policy.popTierLabel ?? null,
        nextPopThreshold: live?.policy.nextPopThreshold ?? null,
        economyPhase: live?.policy.phase ?? null,
        impliedLiabilityMetro,
        coverageRatio: impliedLiabilityMetro > 0 ? r2(pool / impliedLiabilityMetro) : null,
        emission7dMetro: r2(emit7 / rate),
        globalDailyWithdrawMetro: live?.policy.globalDailyWithdrawMetro ?? null,
        note: live?.policy.note ?? null,
        metroUsd: live?.metroUsd ?? null,
        priceMult: live?.priceMult ?? null,
        priceSource: live?.priceSource ?? null,
        priceStale: live?.priceStale ?? null,
      },
      forecast: {
        method: "EWMA(14d, α=0.35) on bridge history + 1% seed",
        depositsPerDayMetro: r2(depositsPerDay),
        withdrawalsPerDayMetro: r2(withdrawalsPerDay),
        netPoolPerDayMetro: r2(netPoolPerDay),
        pool30dMetro: r2(Math.max(0, pool + netPoolPerDay * 30)),
        daysUntilDry: netPoolPerDay < 0 && pool > 0 ? Math.floor(pool / -netPoolPerDay) : null,
        emittedCreditsPerDay: r2(ewma(emitByDay, 14)),
      },
    }),
    { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } },
  );
}

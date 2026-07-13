import type { PlayerLook } from "../../src/net/protocol";

export interface RemotePlayerSource {
  id: string;
  x: number;
  y: number;
  hp: number;
  dead: boolean;
  dashUntilTick: number;
  droneUntilTick: number;
}

/** The only player fields another client needs to render a nearby runner. */
export interface RemotePlayerView {
  id: string;
  x: number;
  y: number;
  hp: number;
  dead: boolean;
  look: PlayerLook | undefined;
  dash?: 1;
  escort?: 1;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Data-minimizing remote snapshot. Progression, wallets, currency, campaign and
 * input acknowledgement remain self-only in WorldDO's viewer-specific payload.
 */
export function remotePlayerView(p: RemotePlayerSource, tick: number, look: PlayerLook | undefined): RemotePlayerView {
  return {
    id: p.id,
    x: round2(p.x),
    y: round2(p.y),
    hp: Math.max(0, Math.round(p.hp)),
    dead: p.dead,
    look,
    ...(tick < p.dashUntilTick ? { dash: 1 as const } : {}),
    ...(tick < p.droneUntilTick ? { escort: 1 as const } : {}),
  };
}

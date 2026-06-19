import type Player from "../entities/Player";

/**
 * Effects an ability hook can invoke. GameScene implements AbilityHost, so class
 * ability/ultimate hooks stay data (config + a tiny run() that calls these), with
 * no dependency on the concrete scene.
 */
export interface AbilityHost {
  /** Instant damage to all cops within radius of (x,y). */
  aoeDamage(x: number, y: number, radius: number, dmg: number): void;
  /** Telegraphed circle that blasts (AoE damage) after delayMs. */
  telegraphBlast(
    x: number,
    y: number,
    radius: number,
    dmg: number,
    delayMs: number,
    color: number,
  ): void;
  /** Lingering zone that ticks damage over durMs. */
  lingeringPool(
    x: number,
    y: number,
    radius: number,
    dps: number,
    durMs: number,
    color: number,
  ): void;
  /** Disable cops within a cone (angle ± halfDeg, out to range) for durMs. */
  coneDisable(
    angle: number,
    range: number,
    halfDeg: number,
    durMs: number,
    color: number,
  ): void;
  /** Spawn ally minions near (x,y). */
  spawnMinions(
    count: number,
    x: number,
    y: number,
    lifeMs: number,
    tint: number,
    dmg: number,
  ): void;
  /** Dash the player along angle and plant a delayed charge at the start point. */
  dashStrike(player: Player, angle: number, color: number): void;
}

export interface AbilityCtx {
  host: AbilityHost;
  player: Player;
  aimX: number;
  aimY: number;
  aimAngle: number;
}

export interface AbilityDef {
  name: string;
  desc: string;
  cooldownMs: number;
  run(ctx: AbilityCtx): void;
}

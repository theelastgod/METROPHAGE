// METROPHAGE — data-driven class system.
//
// Each archetype is a data entry: identity color, base stats, a PRIMARY weapon
// config, plus an ability + ultimate whose effects are tiny hooks calling the
// generic AbilityHost. Classes stay config, not bespoke systems.

import type { AbilityDef } from "./ability";

/** Primary-weapon configs, interpreted generically by GameScene.fireWeapon. */
export type PrimaryDef =
  | {
      kind: "spread"; // short-range cone of pellets
      fireRateMs: number;
      damage: number;
      speed: number;
      lifetimeMs: number;
      pellets: number;
      spreadDeg: number;
    }
  | {
      kind: "burst"; // N-round burst per trigger
      fireRateMs: number;
      damage: number;
      speed: number;
      lifetimeMs: number;
      burstCount: number;
      burstGapMs: number;
    }
  | {
      kind: "rapid"; // very fast, weak, slightly inaccurate
      fireRateMs: number;
      damage: number;
      speed: number;
      lifetimeMs: number;
      jitterDeg: number;
    }
  | {
      kind: "beam"; // piercing hitscan line (bonus vs shields lands in Step 3)
      fireRateMs: number;
      damage: number;
      range: number;
      halfWidth: number;
    };

export interface ClassDef {
  id: string;
  name: string;
  color: number; // identity tint (0xRRGGBB)
  hex: string; // same, for CSS/text
  maxHp: number;
  speed: number; // px/sec
  primary: PrimaryDef;
  primaryName: string;
  primaryDesc: string;
  ability: AbilityDef; // cooldown-gated
  ultimate: AbilityDef; // Heat-gated
  /** Signature status the primary inflicts on hit (undefined = pure physical). */
  element?: StatusKind;
}

/** On-hit status effects. burn = damage-over-time, chill = slow, shock = brief stun. */
export type StatusKind = "burn" | "chill" | "shock";

export const CLASSES: ClassDef[] = [
  {
    id: "metrophage",
    name: "METROPHAGE",
    color: 0x6bff3d,
    hex: "#6bff3d",
    element: "burn",
    maxHp: 110,
    speed: 196,
    primaryName: "CONTAGION SPRAY",
    primaryDesc: "Short-range cone of infectious pellets.",
    primary: {
      kind: "spread",
      fireRateMs: 230,
      damage: 9,
      speed: 360,
      lifetimeMs: 260,
      pellets: 5,
      spreadDeg: 42,
    },
    ability: {
      name: "INFECTION POD",
      desc: "Lob a pod that bursts into a lingering infection pool.",
      cooldownMs: 4500,
      run: (c) => {
        c.host.telegraphBlast(c.aimX, c.aimY, 46, 22, 420, 0x6bff3d);
        c.host.lingeringPool(c.aimX, c.aimY, 50, 30, 3000, 0x6bff3d);
      },
    },
    ultimate: {
      name: "CONTAGION BLOOM",
      desc: "Wide AoE infection burst + heavy damage-over-time.",
      cooldownMs: 11000,
      run: (c) => {
        c.host.aoeDamage(c.player.x, c.player.y, 150, 38);
        c.host.lingeringPool(c.player.x, c.player.y, 150, 44, 4000, 0x6bff3d);
      },
    },
  },
  {
    id: "k-guerilla",
    name: "K-GUERILLA",
    color: 0xff2d9b,
    hex: "#ff2d9b",
    maxHp: 100,
    speed: 206,
    primaryName: "BURST SMG",
    primaryDesc: "Mid-range three-round bursts.",
    primary: {
      kind: "burst",
      fireRateMs: 470,
      damage: 13,
      speed: 640,
      lifetimeMs: 900,
      burstCount: 3,
      burstGapMs: 55,
    },
    ability: {
      name: "DASH-STRIKE",
      desc: "Dash forward and plant a delayed charge at your start point.",
      cooldownMs: 4200,
      run: (c) => c.host.dashStrike(c.player, c.aimAngle, 0xff2d9b),
    },
    ultimate: {
      name: "AIRSTRIKE",
      desc: "Mark a zone; a heavy strike lands after a short delay.",
      cooldownMs: 12000,
      run: (c) => c.host.telegraphBlast(c.aimX, c.aimY, 92, 80, 1100, 0xff2d9b),
    },
  },
  {
    id: "wintermute",
    name: "WINTERMUTE",
    color: 0x29e7ff,
    hex: "#29e7ff",
    element: "chill",
    maxHp: 90,
    speed: 200,
    primaryName: "ICE BEAM",
    primaryDesc: "Piercing beam. Bonus vs shields.",
    primary: {
      kind: "beam",
      fireRateMs: 250,
      damage: 16,
      range: 360,
      halfWidth: 11,
    },
    ability: {
      name: "HACK CONE",
      desc: "Disable enemies in a cone (and break shields) briefly.",
      cooldownMs: 6000,
      run: (c) => c.host.coneDisable(c.aimAngle, 230, 34, 2500, 0x29e7ff),
    },
    ultimate: {
      name: "DEPLOY DRONES",
      desc: "Two autonomous drones hunt and attack nearby enemies.",
      cooldownMs: 13000,
      run: (c) => c.host.spawnMinions(2, c.player.x, c.player.y, 9000, 0x29e7ff, 11),
    },
  },
  {
    id: "swarm",
    name: "SWARM",
    color: 0x9b5cff,
    hex: "#9b5cff",
    element: "shock",
    maxHp: 95,
    speed: 212,
    primaryName: "SWARM-BOLTS",
    primaryDesc: "Rapid weak bolts that buzz outward.",
    primary: {
      kind: "rapid",
      fireRateMs: 92,
      damage: 6,
      speed: 520,
      lifetimeMs: 700,
      jitterDeg: 10,
    },
    ability: {
      name: "MINION PACK",
      desc: "Release a small pack of roaming minions.",
      cooldownMs: 6000,
      run: (c) => c.host.spawnMinions(3, c.player.x, c.player.y, 7000, 0x9b5cff, 7),
    },
    ultimate: {
      name: "SWARM TIDE",
      desc: "Flood a target area with a swarm of minions.",
      cooldownMs: 13000,
      run: (c) => c.host.spawnMinions(8, c.aimX, c.aimY, 8000, 0x9b5cff, 7),
    },
  },
];

export function getClass(id: string | undefined): ClassDef {
  return CLASSES.find((c) => c.id === id) ?? CLASSES[0];
}

// METROPHAGE — data-driven class system.
//
// Each archetype is a data entry: identity color, base stats, and a PRIMARY
// weapon config the weapon system interprets. Abilities/ultimates are added in
// Phase 1 Step 2 as more data fields + small hooks — classes stay config, not code.

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
}

export const CLASSES: ClassDef[] = [
  {
    id: "metrophage",
    name: "METROPHAGE",
    color: 0x6bff3d,
    hex: "#6bff3d",
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
  },
  {
    id: "wintermute",
    name: "WINTERMUTE",
    color: 0x29e7ff,
    hex: "#29e7ff",
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
  },
  {
    id: "swarm",
    name: "SWARM",
    color: 0x9b5cff,
    hex: "#9b5cff",
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
  },
];

export function getClass(id: string | undefined): ClassDef {
  return CLASSES.find((c) => c.id === id) ?? CLASSES[0];
}

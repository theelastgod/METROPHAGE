// METROPHAGE — equippable weapons. A weapon item (inventory slot "weapon") carries a
// `weaponId`; equipping it OVERRIDES the class primary's fire behavior, so a better find
// genuinely changes how you fight. The item's RARITY still supplies the ModBag stat lines
// (damage etc.), so power scales the usual way — the weapon defines the *feel*, the rarity
// the *numbers*. Each has a distinct projectile tint (or a swung blade, for swords), an
// icon (by `klass`, tinted) and a $METRO store price + tier.

/**
 * Primary-weapon fire configs, interpreted generically by GameScene.fireWeapon. Lives
 * here (with the weapons) rather than in classes.ts so the weapon/item model stays free
 * of the class → ability → render chain, and can be shared with the server.
 */
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
      kind: "beam"; // piercing hitscan line
      fireRateMs: number;
      damage: number;
      range: number;
      halfWidth: number;
    }
  | {
      kind: "melee"; // a swung energy blade — hits a cone in front, no projectile
      fireRateMs: number;
      damage: number;
      range: number;
      arcDeg: number; // half-arc of the swing each side of aim
    };

export type WeaponTier = "common" | "rare" | "exotic";

export interface WeaponDef {
  id: string;
  name: string;
  klass: string; // type label — also the icon key ("SMG", "SHOTGUN", "KATANA", …)
  desc: string;
  tint: number; // projectile / blade / icon colour
  primary: PrimaryDef;
  tier: WeaponTier;
  metro: number; // Black-Market price in $METRO
  /** Exotic = never drops randomly (Black-Market only); a clear cut above the rest. */
  exotic?: boolean;
  /** Subway-only: a unique reward found in THE UNDERLINE; never in the store or drop pool. */
  subwayOnly?: boolean;
}

export const WEAPONS: WeaponDef[] = [
  // ── COMMON — cheap, dependable, also drop ───────────────────────────────────
  {
    id: "sting", name: "STING", klass: "PISTOL", tier: "common", metro: 20,
    desc: "Standard-issue sidearm. Reliable, nothing more.",
    tint: 0x9fdcff,
    primary: { kind: "rapid", fireRateMs: 240, damage: 12, speed: 600, lifetimeMs: 820, jitterDeg: 2 },
  },
  {
    id: "needler", name: "NEEDLER", klass: "SMG", tier: "common", metro: 50,
    desc: "Whisper-fast flechettes that buzz the target.",
    tint: 0x9b5cff,
    primary: { kind: "rapid", fireRateMs: 70, damage: 5, speed: 620, lifetimeMs: 640, jitterDeg: 6 },
  },
  {
    id: "vector", name: "VECTOR SMG", klass: "SMG", tier: "common", metro: 60,
    desc: "Rapid spray of light rounds.",
    tint: 0xf7ff3c,
    primary: { kind: "rapid", fireRateMs: 90, damage: 7, speed: 560, lifetimeMs: 720, jitterDeg: 9 },
  },
  {
    id: "peacemaker", name: "PEACEMAKER", klass: "REVOLVER", tier: "common", metro: 70,
    desc: "Heavy revolver — slow, but each round hits like a truck.",
    tint: 0xffd24a,
    primary: { kind: "rapid", fireRateMs: 420, damage: 26, speed: 740, lifetimeMs: 900, jitterDeg: 1 },
  },
  {
    id: "flak", name: "FLAK-9", klass: "FLAK", tier: "common", metro: 80,
    desc: "Heavy slugs in a wide arc.",
    tint: 0xff2bd6,
    primary: { kind: "spread", fireRateMs: 360, damage: 9, speed: 440, lifetimeMs: 420, pellets: 5, spreadDeg: 34 },
  },
  {
    id: "breacher", name: "BREACHER", klass: "SHOTGUN", tier: "common", metro: 90,
    desc: "Close-range cone of buckshot. Brutal up close.",
    tint: 0xff7a3c,
    primary: { kind: "spread", fireRateMs: 520, damage: 11, speed: 520, lifetimeMs: 300, pellets: 7, spreadDeg: 50 },
  },

  // ── RARE — sidegrades + specialists ─────────────────────────────────────────
  {
    id: "hornet", name: "HORNET", klass: "BURST-RIFLE", tier: "rare", metro: 110,
    desc: "Tight four-round bursts at range.",
    tint: 0x39ffd0,
    primary: { kind: "burst", fireRateMs: 440, damage: 13, speed: 700, lifetimeMs: 950, burstCount: 4, burstGapMs: 50 },
  },
  {
    id: "scorpion", name: "SCORPION", klass: "MACHINE-PISTOL", tier: "rare", metro: 120,
    desc: "Full-auto machine-pistol. Spits venom-tipped rounds.",
    tint: 0x8bff6a,
    primary: { kind: "rapid", fireRateMs: 60, damage: 6, speed: 640, lifetimeMs: 620, jitterDeg: 8 },
  },
  {
    id: "arcblade", name: "ARC-BLADE", klass: "BLADE", tier: "rare", metro: 130,
    desc: "A wide energy-sword arc. No ammo, all menace.",
    tint: 0x29e7ff,
    primary: { kind: "melee", fireRateMs: 360, damage: 34, range: 78, arcDeg: 62 },
  },
  {
    id: "monokat", name: "MONO-KATANA", klass: "KATANA", tier: "rare", metro: 150,
    desc: "Monofilament edge — long, fast, deep cuts.",
    tint: 0xff2bd6,
    primary: { kind: "melee", fireRateMs: 280, damage: 28, range: 96, arcDeg: 42 },
  },
  {
    id: "railgun", name: "RAIL-LANCE", klass: "RAILGUN", tier: "rare", metro: 160,
    desc: "Piercing hitscan lance. Shreds shields.",
    tint: 0x29e7ff,
    primary: { kind: "beam", fireRateMs: 300, damage: 22, range: 420, halfWidth: 9 },
  },
  {
    id: "longshot", name: "LONGSHOT", klass: "MARKSMAN", tier: "rare", metro: 180,
    desc: "Anti-materiel marksman rifle. One shot, one obituary.",
    tint: 0x9fe8ff,
    primary: { kind: "rapid", fireRateMs: 620, damage: 42, speed: 1020, lifetimeMs: 1200, jitterDeg: 0 },
  },
  {
    id: "ripsaw", name: "RIPSAW", klass: "LMG", tier: "rare", metro: 200,
    desc: "Belt-fed light machine-gun. Suppress, then advance.",
    tint: 0xff5a4a,
    primary: { kind: "rapid", fireRateMs: 65, damage: 8, speed: 600, lifetimeMs: 760, jitterDeg: 11 },
  },
  {
    id: "cinder", name: "CINDER", klass: "FLAME", tier: "rare", metro: 210,
    desc: "Short-range incinerator — a roaring cone of fire.",
    tint: 0xff7a2c,
    primary: { kind: "rapid", fireRateMs: 40, damage: 5, speed: 360, lifetimeMs: 280, jitterDeg: 16 },
  },
  {
    id: "thumper", name: "THUMPER", klass: "LAUNCHER", tier: "rare", metro: 220,
    desc: "Grenade launcher — lobs three fat charges in an arc.",
    tint: 0xffb13c,
    primary: { kind: "spread", fireRateMs: 700, damage: 22, speed: 430, lifetimeMs: 520, pellets: 3, spreadDeg: 18 },
  },
  {
    id: "tesla", name: "TESLA-ARC", klass: "ARC", tier: "rare", metro: 240,
    desc: "Arc projector — a stuttering bolt of caged lightning.",
    tint: 0x6bdcff,
    primary: { kind: "beam", fireRateMs: 180, damage: 14, range: 260, halfWidth: 14 },
  },

  // ── EXOTIC — Black-Market only, the top of the arsenal ──────────────────────
  {
    id: "wraith", name: "WRAITH", klass: "SMG", tier: "exotic", exotic: true, metro: 200,
    desc: "Silent flechette storm — absurd rate of fire, no recoil.",
    tint: 0xb06bff,
    primary: { kind: "rapid", fireRateMs: 55, damage: 9, speed: 700, lifetimeMs: 700, jitterDeg: 5 },
  },
  {
    id: "daemon", name: "DAEMON-9", klass: "FLAK", tier: "exotic", exotic: true, metro: 280,
    desc: "Roaring arc of heavy slugs — crowd control made cruel.",
    tint: 0xff2bd6,
    primary: { kind: "spread", fireRateMs: 320, damage: 12, speed: 480, lifetimeMs: 460, pellets: 7, spreadDeg: 38 },
  },
  {
    id: "gigadeath", name: "GIGA-DEATH", klass: "SHOTGUN", tier: "exotic", exotic: true, metro: 380,
    desc: "Nine-slug demolition cone. Deletes anything point-blank.",
    tint: 0xff7a3c,
    primary: { kind: "spread", fireRateMs: 470, damage: 15, speed: 560, lifetimeMs: 320, pellets: 9, spreadDeg: 46 },
  },
  {
    id: "tempest", name: "TEMPEST", klass: "BURST-RIFLE", tier: "exotic", exotic: true, metro: 480,
    desc: "Five-round overcharged bursts that punch through armour.",
    tint: 0x39ffd0,
    primary: { kind: "burst", fireRateMs: 360, damage: 17, speed: 780, lifetimeMs: 1000, burstCount: 5, burstGapMs: 42 },
  },
  {
    id: "voidedge", name: "VOID-EDGE", klass: "KATANA", tier: "exotic", exotic: true, metro: 600,
    desc: "A blade of folded vacuum — long reach, devastating sweep.",
    tint: 0x39ff88,
    primary: { kind: "melee", fireRateMs: 240, damage: 46, range: 112, arcDeg: 54 },
  },
  {
    id: "singularity", name: "SINGULARITY LANCE", klass: "RAILGUN", tier: "exotic", exotic: true, metro: 800,
    desc: "A collapsing-star beam. Pierces everything in a long line.",
    tint: 0xeafdff,
    primary: { kind: "beam", fireRateMs: 240, damage: 38, range: 540, halfWidth: 13 },
  },
  // ── UNIQUE — pulled from the dark under the city; THE UNDERLINE's hoard. ──
  {
    id: "thirdrail", name: "THE THIRD RAIL", klass: "ARC", tier: "exotic", exotic: true, subwayOnly: true, metro: 0,
    desc: "A live transit rail, weaponised. Forks lethal current through everything close.",
    tint: 0x6bdcff,
    primary: { kind: "beam", fireRateMs: 150, damage: 26, range: 320, halfWidth: 18 },
  },
];

/** Standard drop pool — exotics + subway uniques are excluded. */
export const WEAPON_IDS = WEAPONS.filter((w) => !w.exotic && !w.subwayOnly).map((w) => w.id);

/** The premium exotics (Black-Market only; subway uniques excluded). */
export const EXOTIC_WEAPONS = WEAPONS.filter((w) => w.exotic && !w.subwayOnly);

/** The full weapon catalogue the Black Market sells, cheapest first (no subway uniques). */
export const WEAPON_STORE = WEAPONS.filter((w) => !w.subwayOnly).sort((a, b) => a.metro - b.metro);

export function getWeapon(id: string | undefined): WeaponDef | undefined {
  return id ? WEAPONS.find((w) => w.id === id) : undefined;
}

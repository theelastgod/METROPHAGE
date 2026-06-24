// METROPHAGE — equippable weapons. A weapon item (inventory slot "weapon") carries a
// `weaponId`; equipping it OVERRIDES the class primary's fire behavior, so a better find
// genuinely changes how you fight. The item's RARITY still supplies the ModBag stat lines
// (damage etc.), so power scales the usual way — the weapon defines the *feel*, the rarity
// the *numbers*. Each has a distinct projectile tint (or a swung blade, for swords).

import type { PrimaryDef } from "./classes";

export interface WeaponDef {
  id: string;
  name: string;
  klass: string; // short type label for the UI ("SMG", "BLADE", …)
  desc: string;
  tint: number; // projectile / blade colour
  primary: PrimaryDef;
}

export const WEAPONS: WeaponDef[] = [
  {
    id: "vector",
    name: "VECTOR SMG",
    klass: "SMG",
    desc: "Rapid spray of light rounds.",
    tint: 0xf7ff3c,
    primary: { kind: "rapid", fireRateMs: 90, damage: 7, speed: 560, lifetimeMs: 720, jitterDeg: 9 },
  },
  {
    id: "breacher",
    name: "BREACHER",
    klass: "SHOTGUN",
    desc: "Close-range cone of buckshot. Brutal up close.",
    tint: 0xff7a3c,
    primary: { kind: "spread", fireRateMs: 520, damage: 11, speed: 520, lifetimeMs: 300, pellets: 7, spreadDeg: 50 },
  },
  {
    id: "hornet",
    name: "HORNET",
    klass: "BURST-RIFLE",
    desc: "Tight four-round bursts at range.",
    tint: 0x39ffd0,
    primary: { kind: "burst", fireRateMs: 440, damage: 13, speed: 700, lifetimeMs: 950, burstCount: 4, burstGapMs: 50 },
  },
  {
    id: "railgun",
    name: "RAIL-LANCE",
    klass: "RAILGUN",
    desc: "Piercing hitscan lance. Shreds shields.",
    tint: 0x29e7ff,
    primary: { kind: "beam", fireRateMs: 300, damage: 22, range: 420, halfWidth: 9 },
  },
  {
    id: "flak",
    name: "FLAK-9",
    klass: "FLAK",
    desc: "Heavy slugs in a wide arc.",
    tint: 0xff2bd6,
    primary: { kind: "spread", fireRateMs: 360, damage: 9, speed: 440, lifetimeMs: 420, pellets: 5, spreadDeg: 34 },
  },
  {
    id: "needler",
    name: "NEEDLER",
    klass: "SMG",
    desc: "Whisper-fast flechettes that buzz the target.",
    tint: 0x9b5cff,
    primary: { kind: "rapid", fireRateMs: 70, damage: 5, speed: 620, lifetimeMs: 640, jitterDeg: 6 },
  },
  // ── melee — cyber swords ───────────────────────────────────────────────────
  {
    id: "arcblade",
    name: "ARC-BLADE",
    klass: "BLADE",
    desc: "A wide energy-sword arc. No ammo, all menace.",
    tint: 0x29e7ff,
    primary: { kind: "melee", fireRateMs: 360, damage: 34, range: 78, arcDeg: 62 },
  },
  {
    id: "monokat",
    name: "MONO-KATANA",
    klass: "KATANA",
    desc: "Monofilament edge — long, fast, deep cuts.",
    tint: 0xff2bd6,
    primary: { kind: "melee", fireRateMs: 280, damage: 28, range: 96, arcDeg: 42 },
  },
];

export const WEAPON_IDS = WEAPONS.map((w) => w.id);

export function getWeapon(id: string | undefined): WeaponDef | undefined {
  return id ? WEAPONS.find((w) => w.id === id) : undefined;
}

import Phaser from "phaser";
import {
  CHAR,
  drawCharacter,
  tonesFromColor,
  PLAYER_SPECS,
  type Build,
  type Head,
  type Visor,
  type Shoulders,
  type Decal,
  type Cloak,
  type Hair,
  type CharSpec,
} from "../assets/charart";
import { bakeDrawnFrames } from "../assets/pixelart";
import { getClass } from "./classes";
import type { PlayerLook } from "../net/protocol";

// METROPHAGE — player character customization. After picking a class (cyberian),
// the player tunes a look: signature colour + silhouette (build / headgear / optic
// / accents). It's all data; the parametric drawCharacter() bakes the sprite and
// the colour is applied as an in-scene tint (the sprite is grayscale).

/** Texture key for the baked custom player sprite (4 facings). */
export const PLAYER_CUSTOM_KEY = "player_custom";

export interface Customization {
  callsign: string; // player's chosen name / handle
  color: number; // signature neon tint
  build: Build;
  head: Head;
  visor: Visor; // optic style
  shoulders: Shoulders; // shoulder armor
  decal: Decal; // emissive chest insignia
  cloak: Cloak; // cape / coat
  skin: number; // human skin tone, or -1 = SYNTH (cyber visor, no face)
  hair: Hair;
  hairColor: number;
  antennae: boolean;
  emblem: boolean; // glowing chest core
  strap: boolean; // bandolier
}

/** Max callsign length + the characters a callsign may contain. */
export const CALLSIGN_MAX = 12;
const CALLSIGN_RE = /[A-Z0-9-]/;

/** Themed default handles (a fresh run gets a random one, editable). */
const CALLSIGN_POOL = [
  "NEOREAVER", "NULLSEC", "VECTOR", "WRAITH", "CIPHER", "HEXWARE",
  "GHOSTRUN", "BLACKICE", "ECHO-9", "STATIC", "VANTA", "RELAY",
];

export function randomCallsign(): string {
  return CALLSIGN_POOL[Math.floor(Math.random() * CALLSIGN_POOL.length)];
}

/** Clean an arbitrary string into a valid callsign (upper, allowed chars, clamped). */
export function cleanCallsign(s: string): string {
  return (s || "")
    .toUpperCase()
    .split("")
    .filter((ch) => CALLSIGN_RE.test(ch))
    .join("")
    .slice(0, CALLSIGN_MAX);
}

/** Selectable neon colours for the signature tint. */
export const CUSTOM_COLORS: ReadonlyArray<{ name: string; value: number }> = [
  { name: "CYAN", value: 0x00e5ff },
  { name: "GREEN", value: 0x39ff88 },
  { name: "MAGENTA", value: 0xff2bd6 },
  { name: "VIOLET", value: 0xb06bff },
  { name: "AMBER", value: 0xf7a23c },
  { name: "GOLD", value: 0xf7ff3c },
  { name: "RED", value: 0xff4d5e },
  { name: "ICE", value: 0x8fe9ff },
  { name: "LIME", value: 0x9dff3c },
  { name: "ROSE", value: 0xff79c6 },
  { name: "ORANGE", value: 0xff7a18 },
  { name: "TEAL", value: 0x2cf5c8 },
  { name: "AZURE", value: 0x4d8cff },
  { name: "CRIMSON", value: 0xd6193f },
  { name: "BUBBLEGUM", value: 0xff5fa2 },
  { name: "TOXIC", value: 0xc6ff3c },
  { name: "ULTRA", value: 0xc04bff },
  { name: "BONE", value: 0xeae6ff },
];

export const CUSTOM_BUILDS: ReadonlyArray<Build> = ["slim", "normal", "bulky", "huge"];
export const CUSTOM_HEADS: ReadonlyArray<Head> = ["helmet", "hood", "cap", "drone", "mohawk", "horns", "crown"];
export const CUSTOM_VISORS: ReadonlyArray<Visor> = ["band", "goggles", "single", "wide", "cross", "scan", "round"];
export const CUSTOM_SHOULDERS: ReadonlyArray<Shoulders> = ["none", "pads", "spikes", "heavy"];
export const CUSTOM_DECALS: ReadonlyArray<Decal> = ["none", "cross", "triangle", "ring", "bars", "skull"];
export const CUSTOM_CLOAKS: ReadonlyArray<Cloak> = ["none", "cape", "coat"];

/** Human-readable labels for the silhouette options. */
export const HEAD_LABELS: Record<Head, string> = {
  helmet: "HELMET",
  hood: "HOOD",
  cap: "CAP",
  drone: "DRONE",
  mohawk: "CREST",
  horns: "HORNS",
  crown: "CROWN",
};
export const VISOR_LABELS: Record<Visor, string> = {
  band: "VISOR BAND",
  goggles: "GOGGLES",
  single: "MONO-OPTIC",
  wide: "WIDE SLIT",
  cross: "CROSS-OPTIC",
  scan: "SCANNER",
  round: "TWIN LENS",
};
export const BUILD_LABELS: Record<Build, string> = {
  slim: "SLIM",
  normal: "STANDARD",
  bulky: "HEAVY",
  huge: "TITAN",
};
export const SHOULDERS_LABELS: Record<Shoulders, string> = {
  none: "NONE",
  pads: "PADS",
  spikes: "SPIKES",
  heavy: "PAULDRONS",
};
export const DECAL_LABELS: Record<Decal, string> = {
  none: "NONE",
  cross: "CROSS",
  triangle: "DELTA",
  ring: "RING",
  bars: "BARS",
  skull: "SKULL",
};
export const CLOAK_LABELS: Record<Cloak, string> = {
  none: "NONE",
  cape: "CAPE",
  coat: "LONGCOAT",
};

/** Skin tones. SYNTH (-1) = no human face — keeps the cyber visor/headgear look. */
export const SKIN_TONES: ReadonlyArray<{ name: string; value: number }> = [
  { name: "SYNTH", value: -1 },
  { name: "PORCELAIN", value: 0xf3d2b8 },
  { name: "FAIR", value: 0xe6b58c },
  { name: "TAN", value: 0xc98a5e },
  { name: "OLIVE", value: 0xa9794a },
  { name: "BROWN", value: 0x7c4f30 },
  { name: "DEEP", value: 0x4f3220 },
];
export const HAIR_STYLES: ReadonlyArray<Hair> = ["none", "short", "long", "spiky", "bun", "afro", "ponytail"];
export const HAIR_LABELS: Record<Hair, string> = {
  none: "BALD",
  short: "SHORT",
  long: "LONG",
  spiky: "SPIKED",
  bun: "TOP-KNOT",
  afro: "AFRO",
  ponytail: "PONYTAIL",
};
export const HAIR_COLORS: ReadonlyArray<{ name: string; value: number }> = [
  { name: "BLACK", value: 0x1b1820 },
  { name: "BROWN", value: 0x4a2f1c },
  { name: "CHESTNUT", value: 0x7a4a24 },
  { name: "BLONDE", value: 0xe6c878 },
  { name: "AUBURN", value: 0x9c3b22 },
  { name: "SILVER", value: 0xc7cdd8 },
  { name: "WHITE", value: 0xeef0f5 },
  { name: "CYAN", value: 0x35e6ff },
  { name: "PINK", value: 0xff5fb0 },
];

/** A customization seeded from the chosen class's default look + signature colour. */
export function defaultCustomization(classId: string | undefined): Customization {
  const cls = getClass(classId);
  const spec = PLAYER_SPECS[cls.id] ?? PLAYER_SPECS.wintermute;
  return {
    callsign: randomCallsign(),
    color: cls.color,
    build: spec.build === "huge" ? "bulky" : spec.build,
    head: spec.head,
    visor: spec.visor,
    shoulders: spec.shoulders ?? "none",
    decal: spec.decal ?? "none",
    cloak: spec.cloak ?? "none",
    skin: spec.skin ?? -1, // SYNTH — classes default to the cyber look
    hair: spec.hair ?? "none",
    hairColor: spec.hairColor ?? 0x4a2f1c,
    antennae: !!spec.antennae,
    emblem: !!spec.emblem,
    strap: !!spec.strap,
  };
}

/** Build a tintable CharSpec (GRAY tones) from a customization. */
export function customSpec(c: Customization): CharSpec {
  return {
    build: c.build,
    head: c.head,
    visor: c.visor,
    shoulders: c.shoulders,
    decal: c.decal,
    cloak: c.cloak,
    antennae: c.antennae,
    emblem: c.emblem,
    strap: c.strap,
    skin: c.skin >= 0 ? c.skin : undefined, // SYNTH → cyber visor (no human face)
    hair: c.hair,
    hairColor: c.hairColor,
    // Bake in FINAL colours: the gear takes the signature colour, so skin/hair keep
    // their own. The sprite is then rendered with a neutral (white) tint.
    tones: tonesFromColor(c.color),
  };
}

/**
 * Bake the custom player sprite (4 facings) under PLAYER_CUSTOM_KEY. Grayscale, so
 * the scene tints it to c.color. Re-bakes (replaces) on each call — the customizer
 * calls it live as options change.
 */
export function bakeCustomPlayer(scene: Phaser.Scene, c: Customization) {
  bakeDrawnFrames(scene, PLAYER_CUSTOM_KEY, 4, CHAR, CHAR, (ctx, f) =>
    drawCharacter(ctx, f, customSpec(c)),
  );
}

/** Extract the wire appearance (no callsign) from a customization, for multiplayer. */
export function customizationToLook(c: Customization): PlayerLook {
  return {
    color: c.color,
    build: c.build,
    head: c.head,
    visor: c.visor,
    shoulders: c.shoulders,
    decal: c.decal,
    cloak: c.cloak,
    skin: c.skin,
    hair: c.hair,
    hairColor: c.hairColor,
    antennae: c.antennae,
    emblem: c.emblem,
    strap: c.strap,
  };
}

/** Stable texture-cache key for a look. Colour + skin + hair are BAKED in now, so they
 *  are part of the key (the sprite is rendered with a neutral tint, not recoloured). */
export function lookKey(look: PlayerLook | undefined): string {
  const c = sanitizeCustomization(look as unknown as Partial<Customization>, undefined);
  return [
    "rl",
    c.color,
    c.build,
    c.head,
    c.visor,
    c.shoulders,
    c.decal,
    c.cloak,
    c.skin,
    c.hair,
    c.hairColor,
    `${c.antennae ? 1 : 0}${c.emblem ? 1 : 0}${c.strap ? 1 : 0}`,
  ].join("_");
}

/** Bake a remote player's sprite (grayscale, 4 facings) under `key` from a look (cached). */
export function bakeRemoteLook(scene: Phaser.Scene, key: string, look: PlayerLook | undefined): void {
  if (scene.textures.exists(key)) return;
  const c = sanitizeCustomization(look as unknown as Partial<Customization>, undefined);
  bakeDrawnFrames(scene, key, 4, CHAR, CHAR, (ctx, f) => drawCharacter(ctx, f, customSpec(c)));
}

/** Repair a possibly-stale/partial saved customization against the valid options. */
export function sanitizeCustomization(
  raw: Partial<Customization> | undefined,
  classId: string | undefined,
): Customization {
  const d = defaultCustomization(classId);
  if (!raw) return d;
  const pick = <T>(v: unknown, opts: ReadonlyArray<T>, fb: T): T =>
    opts.includes(v as T) ? (v as T) : fb;
  const callsign = typeof raw.callsign === "string" ? cleanCallsign(raw.callsign) : "";
  return {
    callsign: callsign || d.callsign,
    color: typeof raw.color === "number" ? raw.color : d.color,
    build: pick(raw.build, CUSTOM_BUILDS, d.build),
    head: pick(raw.head, CUSTOM_HEADS, d.head),
    visor: pick(raw.visor, CUSTOM_VISORS, d.visor),
    shoulders: pick(raw.shoulders, CUSTOM_SHOULDERS, d.shoulders),
    decal: pick(raw.decal, CUSTOM_DECALS, d.decal),
    cloak: pick(raw.cloak, CUSTOM_CLOAKS, d.cloak),
    skin: typeof raw.skin === "number" ? raw.skin : d.skin,
    hair: pick(raw.hair, HAIR_STYLES, d.hair),
    hairColor: typeof raw.hairColor === "number" ? raw.hairColor : d.hairColor,
    antennae: typeof raw.antennae === "boolean" ? raw.antennae : d.antennae,
    emblem: typeof raw.emblem === "boolean" ? raw.emblem : d.emblem,
    strap: typeof raw.strap === "boolean" ? raw.strap : d.strap,
  };
}

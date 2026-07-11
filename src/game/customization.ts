import Phaser from "phaser";
import {
  tonesFromColor,
  PLAYER_SPECS,
  type Build,
  type Head,
  type Visor,
  type Shoulders,
  type Decal,
  type Cloak,
  type Hair,
  type Beard,
  type FaceMark,
  type Gloves,
  type LegGear,
  type CharSpec,
} from "../assets/charart";
import { getClass } from "./classes";
import { bakeWalkSheet } from "../assets/anim";
import type { PlayerLook } from "../net/protocol";

// METROPHAGE — player character customization. After picking a class, the player
// tunes a human look: skin, hair, signature colour + gear silhouette. It's all data;
// parametric drawCharacter() bakes the sprite with final colours (neutral tint in-scene).

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
  skin: number; // human skin tone (always >= 0)
  sex: "f" | "m"; // human body proportions
  hair: Hair;
  hairColor: number;
  beard: Beard; // facial hair (human faces only)
  faceMark: FaceMark; // scar / tattoo / chrome / war-paint (human faces)
  eyeColor: number; // iris colour (natural or neon)
  gloves: Gloves; // hand gear
  legGear: LegGear; // shin / boot accents
  accentColor: number; // second trim hue (pauldrons, rims, knuckles)
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

export const CUSTOM_SEXES: ReadonlyArray<"f" | "m"> = ["f", "m"];
export const SEX_LABELS: Record<"f" | "m", string> = { f: "FEMALE", m: "MALE" };
export const CUSTOM_BUILDS: ReadonlyArray<Build> = ["slim", "normal", "bulky", "huge"];
export const CUSTOM_HEADS: ReadonlyArray<Head> = [
  "helmet", "hood", "cap", "drone", "mohawk", "horns", "crown", "mask", "beret", "spikes",
];
/** Streetwear head options for human runners — no helmets, drones, or full masks. */
export const HUMAN_HEADS: ReadonlyArray<Head> = ["cap", "hood", "beret"];
/** Natural eyes for human faces — no full-face visors or goggles. */
export const HUMAN_VISORS: ReadonlyArray<Visor> = ["band", "round"];
export const CUSTOM_VISORS: ReadonlyArray<Visor> = ["band", "goggles", "single", "wide", "cross", "scan", "round"];
export const CUSTOM_SHOULDERS: ReadonlyArray<Shoulders> = ["none", "pads", "spikes", "heavy"];
export const CUSTOM_DECALS: ReadonlyArray<Decal> = ["none", "cross", "triangle", "ring", "bars", "skull", "star", "bolt"];
export const CUSTOM_CLOAKS: ReadonlyArray<Cloak> = ["none", "cape", "coat"];
export const FACE_MARKS: ReadonlyArray<FaceMark> = ["none", "scar", "tattoo", "chrome", "warpaint"];
export const CUSTOM_GLOVES: ReadonlyArray<Gloves> = ["none", "wraps", "knuckles", "gauntlets"];
export const CUSTOM_LEG_GEAR: ReadonlyArray<LegGear> = ["none", "wraps", "greaves", "boots"];

/** Human-readable labels for the silhouette options. */
export const HEAD_LABELS: Record<Head, string> = {
  helmet: "HELMET",
  hood: "HOOD",
  cap: "CAP",
  drone: "DRONE",
  mohawk: "CREST",
  horns: "HORNS",
  crown: "CROWN",
  mask: "FACE MASK",
  beret: "BERET",
  spikes: "SPIKE COLLAR",
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
  star: "STAR",
  bolt: "BOLT",
};
export const FACE_MARK_LABELS: Record<FaceMark, string> = {
  none: "NONE",
  scar: "SCAR",
  tattoo: "TATTOO",
  chrome: "CHROME LINES",
  warpaint: "WAR PAINT",
};
export const GLOVES_LABELS: Record<Gloves, string> = {
  none: "BARE",
  wraps: "NEON WRAPS",
  knuckles: "KNUCKLES",
  gauntlets: "GAUNTLETS",
};
export const LEG_GEAR_LABELS: Record<LegGear, string> = {
  none: "STANDARD",
  wraps: "LEG WRAPS",
  greaves: "GREAVES",
  boots: "HEAVY BOOTS",
};
export const CLOAK_LABELS: Record<Cloak, string> = {
  none: "NONE",
  cape: "CAPE",
  coat: "LONGCOAT",
};

/** Default human skin when repairing legacy saves. */
export const DEFAULT_HUMAN_SKIN = 0xc98a5e;

/** Skin tones — all playable characters are human. */
export const SKIN_TONES: ReadonlyArray<{ name: string; value: number }> = [
  { name: "PORCELAIN", value: 0xf3d2b8 },
  { name: "FAIR", value: 0xe6b58c },
  { name: "TAN", value: 0xc98a5e },
  { name: "OLIVE", value: 0xa9794a },
  { name: "BROWN", value: 0x7c4f30 },
  { name: "DEEP", value: 0x4f3220 },
];
export const HAIR_STYLES: ReadonlyArray<Hair> = [
  "none",
  "buzz",
  "short",
  "long",
  "spiky",
  "mohawk",
  "bun",
  "afro",
  "ponytail",
  "braids",
  "undercut",
  "dreads",
];
export const HAIR_LABELS: Record<Hair, string> = {
  none: "BALD",
  buzz: "BUZZED",
  short: "SHORT",
  long: "LONG",
  spiky: "SPIKED",
  mohawk: "MOHAWK",
  bun: "TOP-KNOT",
  afro: "AFRO",
  ponytail: "PONYTAIL",
  braids: "BRAIDS",
  undercut: "UNDERCUT",
  dreads: "DREADS",
};
export const BEARDS: ReadonlyArray<Beard> = ["none", "stubble", "mustache", "goatee", "full"];
export const BEARD_LABELS: Record<Beard, string> = {
  none: "NONE",
  stubble: "STUBBLE",
  mustache: "MOUSTACHE",
  goatee: "GOATEE",
  full: "FULL BEARD",
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
export const EYE_COLORS: ReadonlyArray<{ name: string; value: number }> = [
  { name: "DARK", value: 0x1a1020 },
  { name: "BROWN", value: 0x4a2f1c },
  { name: "HAZEL", value: 0x6a5030 },
  { name: "GREEN", value: 0x2a6a3a },
  { name: "BLUE", value: 0x2a4a8a },
  { name: "GREY", value: 0x6a7080 },
  { name: "CYAN", value: 0x00e5ff },
  { name: "VIOLET", value: 0xb06bff },
  { name: "GOLD", value: 0xf7a23c },
  { name: "RED", value: 0xff3b3b },
  { name: "NEON PINK", value: 0xff2bd6 },
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
    skin: spec.skin ?? 0xc98a5e, // human by default (classes carry a human skin tone)
    sex: spec.sex ?? "m",
    hair: spec.hair ?? "short",
    hairColor: spec.hairColor ?? 0x4a2f1c,
    beard: spec.beard ?? "none",
    faceMark: "none",
    eyeColor: 0x1a1020,
    gloves: "none",
    legGear: "none",
    accentColor: cls.color === 0x00e5ff ? 0xff2bd6 : 0x00e5ff,
    antennae: !!spec.antennae,
    emblem: !!spec.emblem,
    strap: !!spec.strap,
  };
}

const pickRandom = <T>(arr: ReadonlyArray<T>): T => arr[Math.floor(Math.random() * arr.length)];

const NATURAL_EYES = EYE_COLORS.filter((e) => !["CYAN", "VIOLET", "GOLD", "RED", "NEON PINK"].includes(e.name));

/** Strip chrome-drone options so baked sprites read as street humans. */
function humanizeCustomization(c: Customization): Customization {
  const head = HUMAN_HEADS.includes(c.head) ? c.head : "cap";
  const visor = HUMAN_VISORS.includes(c.visor) ? c.visor : "band";
  const shoulders = c.shoulders === "spikes" || c.shoulders === "heavy" ? "none" : c.shoulders;
  const faceMark = c.faceMark === "chrome" || c.faceMark === "warpaint" ? "none" : c.faceMark;
  const build = c.build === "huge" ? "bulky" : c.build;
  return { ...c, head, visor, shoulders, faceMark, build, antennae: false };
}

/** Class-select / menu sprite with jacket colour baked in (skin stays human). */
export function classPreviewSpec(classId: string | undefined, color?: number): CharSpec {
  const cls = getClass(classId);
  const base = PLAYER_SPECS[cls.id] ?? PLAYER_SPECS.wintermute;
  return { ...base, tones: tonesFromColor(color ?? cls.color) };
}

/** A randomized look — biased toward human street mercs, not chrome drones. */
export function randomCustomization(classId: string | undefined): Customization {
  const cls = getClass(classId);
  const skin = pickRandom(SKIN_TONES).value;
  const sex = pickRandom(CUSTOM_SEXES);
  const hairPool = HAIR_STYLES.filter((h) => h !== "none" && h !== "mohawk");
  const beardPool = sex === "f" ? (["none"] as const) : BEARDS;
  const mainColor = cls.color;
  let accentColor = pickRandom(CUSTOM_COLORS).value;
  if (accentColor === mainColor) accentColor = CUSTOM_COLORS[(CUSTOM_COLORS.findIndex((c) => c.value === mainColor) + 5) % CUSTOM_COLORS.length].value;

  return {
    callsign: randomCallsign(),
    color: mainColor,
    accentColor,
    build: pickRandom(["slim", "normal", "normal", "bulky"] as Build[]),
    head: pickRandom(HUMAN_HEADS),
    visor: "band",
    shoulders: Math.random() < 0.12 ? "pads" : "none",
    decal: Math.random() < 0.18 ? pickRandom(["none", "cross", "star", "bolt"] as Decal[]) : "none",
    cloak: Math.random() < 0.62 ? pickRandom(["coat", "coat", "none", "cape"] as Cloak[]) : "none",
    skin,
    sex,
    hair: pickRandom(hairPool),
    hairColor: pickRandom(HAIR_COLORS).value,
    beard: pickRandom(beardPool),
    faceMark: Math.random() < 0.22 ? pickRandom(["none", "scar", "tattoo"] as FaceMark[]) : "none",
    eyeColor: Math.random() < 0.82 ? pickRandom(NATURAL_EYES).value : pickRandom(EYE_COLORS).value,
    gloves: Math.random() < 0.35 ? pickRandom(["none", "wraps", "wraps"] as Gloves[]) : "none",
    legGear: Math.random() < 0.28 ? pickRandom(["none", "boots"] as LegGear[]) : "none",
    antennae: false,
    emblem: Math.random() < 0.06,
    strap: Math.random() < 0.22,
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
    skin: c.skin >= 0 ? c.skin : DEFAULT_HUMAN_SKIN,
    sex: c.sex,
    hair: c.hair,
    hairColor: c.hairColor,
    beard: c.beard,
    faceMark: c.faceMark,
    eyeColor: c.eyeColor,
    gloves: c.gloves,
    legGear: c.legGear,
    accentColor: c.accentColor,
    accentTones: tonesFromColor(c.accentColor),
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
  bakeWalkSheet(scene, PLAYER_CUSTOM_KEY, customSpec(c));
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
    sex: c.sex,
    hair: c.hair,
    hairColor: c.hairColor,
    beard: c.beard,
    faceMark: c.faceMark,
    eyeColor: c.eyeColor,
    gloves: c.gloves,
    legGear: c.legGear,
    accentColor: c.accentColor,
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
    c.sex,
    c.hair,
    c.hairColor,
    c.beard,
    c.faceMark,
    c.eyeColor,
    c.gloves,
    c.legGear,
    c.accentColor,
    `${c.antennae ? 1 : 0}${c.emblem ? 1 : 0}${c.strap ? 1 : 0}`,
  ].join("_");
}

/** Bake a remote player's sprite (grayscale, 4 facings) under `key` from a look (cached). */
export function bakeRemoteLook(scene: Phaser.Scene, key: string, look: PlayerLook | undefined): void {
  if (scene.textures.exists(key)) return;
  const c = sanitizeCustomization(look as unknown as Partial<Customization>, undefined);
  bakeWalkSheet(scene, key, customSpec(c));
}

/** Rehydrate a saved server look (+ optional callsign) into a full customization. */
export function lookToCustomization(look: PlayerLook, callsign?: string, classId?: string): Customization {
  const c = sanitizeCustomization(look as unknown as Partial<Customization>, classId);
  if (callsign) c.callsign = cleanCallsign(callsign) || c.callsign;
  return c;
}

/** Repair a possibly-stale/partial saved customization against the valid options. */
export function sanitizeCustomization(
  raw: Partial<Customization> | undefined,
  classId: string | undefined,
): Customization {
  const d = humanizeCustomization(defaultCustomization(classId));
  if (!raw) return d;
  const pick = <T>(v: unknown, opts: ReadonlyArray<T>, fb: T): T =>
    opts.includes(v as T) ? (v as T) : fb;
  const callsign = typeof raw.callsign === "string" ? cleanCallsign(raw.callsign) : "";
  return humanizeCustomization({
    callsign: callsign || d.callsign,
    color: typeof raw.color === "number" ? raw.color : d.color,
    build: pick(raw.build, CUSTOM_BUILDS, d.build),
    head: pick(raw.head, HUMAN_HEADS, d.head),
    visor: pick(raw.visor, HUMAN_VISORS, d.visor),
    shoulders: pick(raw.shoulders, CUSTOM_SHOULDERS, d.shoulders),
    decal: pick(raw.decal, CUSTOM_DECALS, d.decal),
    cloak: pick(raw.cloak, CUSTOM_CLOAKS, d.cloak),
    skin: typeof raw.skin === "number" && raw.skin >= 0 ? raw.skin : d.skin,
    sex: raw.sex === "f" || raw.sex === "m" ? raw.sex : d.sex,
    hair: pick(raw.hair, HAIR_STYLES, d.hair),
    hairColor: typeof raw.hairColor === "number" ? raw.hairColor : d.hairColor,
    beard: pick(raw.beard, BEARDS, d.beard),
    faceMark: pick(raw.faceMark, FACE_MARKS, d.faceMark),
    eyeColor: typeof raw.eyeColor === "number" ? raw.eyeColor : d.eyeColor,
    gloves: pick(raw.gloves, CUSTOM_GLOVES, d.gloves),
    legGear: pick(raw.legGear, CUSTOM_LEG_GEAR, d.legGear),
    accentColor: typeof raw.accentColor === "number" ? raw.accentColor : d.accentColor,
    antennae: typeof raw.antennae === "boolean" ? raw.antennae : d.antennae,
    emblem: typeof raw.emblem === "boolean" ? raw.emblem : d.emblem,
    strap: typeof raw.strap === "boolean" ? raw.strap : d.strap,
  });
}

import Phaser from "phaser";
import {
  CHAR,
  GRAY,
  drawCharacter,
  PLAYER_SPECS,
  type Build,
  type Head,
  type Visor,
  type CharSpec,
} from "../assets/charart";
import { bakeDrawnFrames } from "../assets/pixelart";
import { getClass } from "./classes";

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
];

export const CUSTOM_BUILDS: ReadonlyArray<Build> = ["slim", "normal", "bulky"];
export const CUSTOM_HEADS: ReadonlyArray<Head> = ["helmet", "hood", "cap", "drone"];
export const CUSTOM_VISORS: ReadonlyArray<Visor> = ["band", "goggles", "single", "wide"];

/** Human-readable labels for the silhouette options. */
export const HEAD_LABELS: Record<Head, string> = {
  helmet: "HELMET",
  hood: "HOOD",
  cap: "CAP",
  drone: "DRONE",
};
export const VISOR_LABELS: Record<Visor, string> = {
  band: "VISOR BAND",
  goggles: "GOGGLES",
  single: "MONO-OPTIC",
  wide: "WIDE SLIT",
};
export const BUILD_LABELS: Record<Build, string> = {
  slim: "SLIM",
  normal: "STANDARD",
  bulky: "HEAVY",
  huge: "TITAN",
};

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
    antennae: c.antennae,
    emblem: c.emblem,
    strap: c.strap,
    tones: GRAY,
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
    antennae: typeof raw.antennae === "boolean" ? raw.antennae : d.antennae,
    emblem: typeof raw.emblem === "boolean" ? raw.emblem : d.emblem,
    strap: typeof raw.strap === "boolean" ? raw.strap : d.strap,
  };
}

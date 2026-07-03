// METROPHAGE — code-authored characters, drawn parametrically at 32×32. Top-down 3/4
// view; frame order matches faceFrame(): [down, left, right, up], `right` mirrors `left`.
//
// FIGURE LANGUAGE (the "human" pass): ~3.4 heads tall — an 8px head on a necked,
// waisted torso with long tapered legs. The old art was a 13px bobblehead on a stub
// body; everything below draws an ADULT. Faces are real: brow, two 2px eyes with
// iris colour, nose, mouth, jaw. Cyberpunk lives in the gear — jacket trim, neon
// wraps, glowing decals/visors — not in the anatomy.
//
// Player / Cop / Boss are drawn GRAYSCALE so the in-scene setTint() recolors them
// (white visor → bright class hue, darks stay dark). The NPC carries its own hues.
// The bright "emissive" tone is pure white so it tints to the class color and the
// neon post-FX blooms it.

export const CHAR = 32; // native px per character frame

/** Walk-cycle frames baked per facing. Sheets are facing-major: the frame index is
 *  `facing * WALK_STEPS + step`, so frame `facing*WALK_STEPS` is the neutral (idle)
 *  stance and the four steps loop as a stride (see assets/anim.ts). */
export const WALK_STEPS = 4;

/** Per-step limb swing — a [0, +1, 0, -1] triangle across the cycle (contact → pass →
 *  contact → pass). Legs/arms offset by this so a baked sheet reads as a walk. */
export function walkSwing(step: number): number {
  return [0, 1, 0, -1][((step % WALK_STEPS) + WALK_STEPS) % WALK_STEPS];
}

export type Facing = "down" | "left" | "right" | "up";
const FACINGS: Facing[] = ["down", "left", "right", "up"];

/** Shading ramp for a character. Grayscale ramps are recolored by setTint. */
interface Tones {
  o: number; // outline (near-black)
  a: number; // shadow
  b: number; // mid
  c: number; // light
  d: number; // highlight
  e: number; // emissive / brightest (tints to the class hue)
  rim: number; // cool rim-light edge
}

/** Grayscale, tinted per class/tier in-scene (player, cop, boss). Exported so the
 *  character customizer can build custom (tintable) player specs. */
export const GRAY: Tones = {
  o: 0x0a0b12,
  a: 0x262b3d,
  b: 0x434a64,
  c: 0x727a98,
  d: 0xb9c0d6,
  e: 0xffffff,
  rim: 0x8fa9c8,
};

const clamp8 = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n | 0);
const scaleColor = (color: number, f: number) =>
  (clamp8(((color >> 16) & 0xff) * f) << 16) | (clamp8(((color >> 8) & 0xff) * f) << 8) | clamp8((color & 0xff) * f);

/** Build a shaded grayscale-style ramp from a base colour, so a sprite can be baked
 *  in its FINAL colours (instead of grayscale + an in-scene tint). Lets one sprite mix
 *  a neon signature colour with real skin/hair colours. */
export function tonesFromColor(color: number): Tones {
  return {
    o: 0x0a0b12,
    a: scaleColor(color, 0.32),
    b: scaleColor(color, 0.54),
    c: scaleColor(color, 0.76),
    d: scaleColor(color, 0.98),
    e: scaleColor(color, 1.4), // brightened emissive (clamped)
    rim: scaleColor(color, 0.86),
  };
}

/** The FIXER civilian — lime/green with a yellow emissive (NOT tinted in-scene). */
const GREEN: Tones = {
  o: 0x0c1408,
  a: 0x274018,
  b: 0x47692c,
  c: 0x77a848,
  d: 0xbce87a,
  e: 0xf7ff3c,
  rim: 0x9dff5a,
};

export type Build = "slim" | "normal" | "bulky" | "huge";
export type Head = "helmet" | "hood" | "cap" | "drone" | "mohawk" | "horns" | "crown" | "mask" | "beret" | "spikes";
export type Visor = "band" | "goggles" | "single" | "wide" | "cross" | "scan" | "round";
export type Shoulders = "none" | "pads" | "spikes" | "heavy";
export type Decal = "none" | "cross" | "triangle" | "ring" | "bars" | "skull" | "star" | "bolt";
export type Cloak = "none" | "cape" | "coat";
export type Hair = "none" | "short" | "long" | "spiky" | "bun" | "afro" | "ponytail" | "buzz" | "mohawk" | "braids" | "undercut" | "dreads";
export type Beard = "none" | "stubble" | "mustache" | "goatee" | "full";
export type FaceMark = "none" | "scar" | "tattoo" | "chrome" | "warpaint";
export type Gloves = "none" | "wraps" | "knuckles" | "gauntlets";
export type LegGear = "none" | "wraps" | "greaves" | "boots";

export interface CharSpec {
  build: Build;
  head: Head;
  visor: Visor;
  tones: Tones;
  antennae?: boolean;
  emblem?: boolean; // glowing chest core
  strap?: boolean; // diagonal bandolier
  collar?: boolean; // raised coat collar (civilian)
  shoulders?: Shoulders; // shoulder armor
  decal?: Decal; // emissive chest insignia
  cloak?: Cloak; // cape / coat drape
  // human look — when `skin` is set, the head is a face (eyes + skin) instead of a
  // visor, and `hair` is drawn on top. The body still uses `tones` (the gear colour).
  skin?: number; // skin colour
  hair?: Hair;
  hairColor?: number;
  beard?: Beard; // facial hair (uses the hair colour)
  sex?: "f" | "m"; // human body proportions (female = slimmer torso + bust; male = broader shoulders)
  faceMark?: FaceMark; // scar / tattoo / chrome-lines / war-paint (human faces)
  eyeColor?: number; // iris colour on human faces (neon allowed)
  gloves?: Gloves; // hand gear — wraps, studded knuckles, heavy gauntlets
  legGear?: LegGear; // shin / boot accents
  accentColor?: number; // second trim hue (pauldrons, rims, knuckles)
  accentTones?: Tones; // pre-baked accent ramp (from accentColor)
}

// ── Per-class player specs (ids match game/classes.ts) ──────────────────────
// Playable runners are humans — skin, hair, eyes, street clothes; jacket colour is baked per class.
export const PLAYER_SPECS: Record<string, CharSpec> = {
  wintermute: {
    build: "normal", head: "cap", visor: "band", tones: GRAY, sex: "f", skin: 0xe6b58c, hair: "long", hairColor: 0x1b1820,
    eyeColor: 0x2a4a8a, beard: "none", cloak: "coat", shoulders: "none", decal: "none",
  },
  metrophage: {
    build: "normal", head: "beret", visor: "band", tones: GRAY, sex: "m", skin: 0xc98a5e, hair: "undercut", hairColor: 0x1b1820,
    beard: "stubble", eyeColor: 0x4a2f1c, cloak: "coat", shoulders: "none", decal: "none", strap: true,
  },
  "k-guerilla": {
    build: "normal", head: "cap", visor: "band", strap: true, tones: GRAY, sex: "m", skin: 0x7c4f30, hair: "short", hairColor: 0x1b1820,
    eyeColor: 0x1a1020, beard: "none", cloak: "coat", shoulders: "none",
  },
  swarm: {
    build: "slim", head: "cap", visor: "band", tones: GRAY, sex: "f", skin: 0xa9794a, hair: "ponytail", hairColor: 0x1b1820,
    eyeColor: 0x6a5030, beard: "none", cloak: "none", shoulders: "none",
  },
};
export const PLAYER_IDS = Object.keys(PLAYER_SPECS);

export const COP_SPEC: CharSpec = { build: "bulky", head: "helmet", visor: "wide", tones: GRAY };
export const BOSS_SPEC: CharSpec = {
  build: "huge",
  head: "helmet",
  visor: "wide",
  emblem: true,
  tones: GRAY,
};
export const NPC_SPEC: CharSpec = {
  build: "normal",
  head: "hood",
  visor: "single",
  collar: true,
  tones: GREEN,
  skin: 0xc98a5e,
  hair: "short",
  hairColor: 0x2a1d14,
  sex: "m",
  beard: "stubble",
};

const hex = (c: number) => "#" + (c & 0xffffff).toString(16).padStart(6, "0");

/** Agent cell size — the ambient crowd is smaller/lighter than the player. */
export const AGENT_W = 16;
export const AGENT_H = 22;

/** A compact grayscale civilian for the ambient crowd (tinted per-instance). `step`
 *  drives a small leg shuffle so the wandering crowd reads as walking. */
export function drawAgent(ctx: CanvasRenderingContext2D, step = 0) {
  const t = GRAY;
  const sw = walkSwing(step);
  const px = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = hex(c);
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  };
  px(4, 20, 8, 1, 0x000000, 0.18); // faint contact shadow
  // small adult: 5px head, necked torso, long legs
  px(6, 1, 5, 5, t.o);
  px(7, 2, 3, 3, t.c); // head
  px(7, 5, 3, 1, t.b); // jaw
  px(7, 6, 2, 1, t.b); // neck
  // torso
  px(5, 7, 7, 1, t.o);
  px(5, 8, 7, 6, t.b);
  px(6, 8, 2, 5, t.c);
  px(10, 9, 1, 5, t.a);
  // arms
  px(4, 8 + sw, 1, 5, t.a);
  px(12, 8 - sw, 1, 5, t.a);
  // legs — alternate on the shuffle
  px(6, 14 - sw, 2, 6, t.a);
  px(9, 14 + sw, 2, 6, t.b);
  px(6, 19 - sw, 2, 1, t.o);
  px(9, 19 + sw, 2, 1, t.o); // boots
}

/**
 * Draw one character frame into `ctx` (already translated so 0,0 is the frame's
 * top-left). Frame index → facing via FACINGS; `right` is drawn as a mirrored
 * `left`. Coordinates assume a 32×32 cell.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  frame: number,
  spec: CharSpec,
  step = 0,
) {
  const facing = FACINGS[frame] ?? "down";
  if (facing === "right") {
    ctx.save();
    ctx.translate(CHAR, 0);
    ctx.scale(-1, 1);
    drawPose(ctx, "left", spec, step);
    ctx.restore();
    return;
  }
  drawPose(ctx, facing, spec, step);
}

/** Accent trim ramp — falls back to the main gear tones when no second colour is set. */
function accentOf(spec: CharSpec): Tones {
  return spec.accentTones ?? spec.tones;
}

type Px = (x: number, y: number, w: number, h: number, c: number, a?: number) => void;
type Part = (x: number, y: number, w: number, h: number, fill: number) => void;

function drawPose(ctx: CanvasRenderingContext2D, facing: Facing, spec: CharSpec, step = 0) {
  const t = spec.tones;
  const acc = accentOf(spec);
  const sw = walkSwing(step); // -1..1 stride phase; legs/arms offset oppositely
  const bob = sw !== 0 ? 1 : 0; // passing frames drop the body 1px — the step bounce
  const px: Px = (x, y, w, h, c, a = 1) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = hex(c);
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  };
  // outline a block then inset-fill it (clean 1px silhouette edge)
  const part: Part = (x, y, w, h, fill) => {
    px(x, y, w, h, t.o);
    px(x + 1, y + 1, w - 2, h - 2, fill);
  };

  // bulk widens the torso/shoulders
  const bulk = spec.build === "huge" ? 4 : spec.build === "bulky" ? 2 : spec.build === "slim" ? -1 : 0;
  const cx = 16;
  const fem = spec.sex === "f";

  // faint contact hint only — the scene draws the real ground shadow
  px(cx - 5, 29, 10, 1, 0x000000, 0.15);

  if (facing === "left") {
    ctx.save();
    ctx.translate(0, bob);
    drawProfile(spec, px, part, bulk, step);
    ctx.restore();
    return;
  }

  const back = facing === "up";
  ctx.save();
  ctx.translate(0, bob);

  // torso metrics (shared by cloak/arms/legs)
  const tw = (fem ? 10 : 12) + bulk; // shoulder width
  const tx = cx - Math.floor(tw / 2);

  // ── cape drapes BEHIND the body (drawn first) ───────────────────
  if (spec.cloak === "cape") {
    const cw = tw + 2;
    if (back) {
      part(cx - Math.floor(cw / 2), 12, cw, 15, t.a); // full cape down the back
      px(cx - Math.floor(cw / 2) + 1, 13, cw - 2, 12, t.b);
      px(cx - 1, 13, 2, 13, t.a, 0.7); // centre fold
      px(cx - Math.floor(cw / 2) + 1, 13, 1, 12, t.rim, 0.6);
    } else {
      px(tx - 2, 13, 2, 13, t.a); // edges peek past the shoulders
      px(tx + tw, 13, 2, 13, t.a);
      px(tx - 2, 13, 1, 13, t.rim, 0.5);
    }
  }

  // ── pelvis (fills the gap between the legs) + legs ──────────────
  part(cx - 4, 18, 9, 4, t.a); // hip block sits under the jacket hem
  const legDy = [-sw, sw];
  [cx - 4, cx + 1].forEach((lx, i) => {
    const dy = legDy[i];
    // trouser: long tapered leg
    px(lx, 20 + dy, 4, 7, t.o);
    px(lx + 1, 20 + dy, 2, 6, i === 0 ? t.a : scaleColor(t.a, 0.85));
    px(lx + 1, 21 + dy, 1, 3, t.b, 0.6); // thigh catch-light
    if (spec.legGear === "wraps") {
      px(lx + 1, 23 + dy, 2, 1, acc.e, 0.9);
      px(lx + 1, 25 + dy, 2, 1, acc.e, 0.75); // neon shin wraps
    } else if (spec.legGear === "greaves") {
      px(lx + 1, 23 + dy, 2, 3, acc.c);
      px(lx + 1, 23 + dy, 1, 3, acc.rim, 0.7); // plated shin
    }
    // boot
    const bootT = spec.legGear === "boots" ? acc.b : t.o;
    px(lx, 27 + dy, 4, 2, t.o);
    px(lx + 1, 27 + dy, 2, 1, bootT === t.o ? t.a : bootT);
    if (spec.legGear === "boots") px(lx + 1, 28 + dy, 3, 1, acc.d, 0.7); // lit sole
  });

  // ── torso: fitted street jacket, waisted; broader yoke for men ──
  part(tx, 12, tw, 5, t.b); // chest
  const wtw = tw - 2; // waist taper
  part(cx - Math.floor(wtw / 2), 15, wtw, 5, t.b); // waist → hips
  px(tx + 1, 12, tw - 2, 1, t.c); // shoulder yoke light
  if (!back) {
    px(tx + 1, 13, 1, 3, t.rim, 0.4); // left rim
    px(tx + 2, 13, 2, 2, t.c, 0.35); // soft chest light
    px(cx, 13, 1, 6, t.a); // zip line
    px(cx - Math.floor(wtw / 2) + 1, 18, wtw - 2, 1, acc.d, 0.65); // belt
    if (fem) {
      px(cx - 3, 14, 2, 1, t.c, 0.75);
      px(cx + 1, 14, 2, 1, t.c, 0.75); // bust light
    }
  } else {
    px(tx + 1, 13, tw - 2, 5, t.a); // back panel
    px(cx, 13, 1, 6, t.o, 0.4); // spine seam
    px(tx + 1, 12, tw - 2, 1, t.c);
  }

  // ── arms: slim sleeves, counter-swing; hands or gloves ──────────
  const laY = 12 + sw;
  const raY = 12 - sw;
  px(tx - 2, laY, 2, 7, t.o);
  px(tx - 1, laY + 1, 1, 5, t.b); // left sleeve
  px(tx + tw, raY, 2, 7, t.o);
  px(tx + tw, raY + 1, 1, 5, scaleColor(t.b, 0.8)); // right sleeve (shadow side)
  drawHands(spec, px, tx - 2, laY + 7, tx + tw, raY + 7, t, acc);

  // ── shoulder armor (over the sleeves) ───────────────────────────
  if (spec.shoulders && spec.shoulders !== "none") drawShoulders(spec, px, part, tx, tw);

  // ── coat: a skirt drapes OVER the legs ──────────────────────────
  if (spec.cloak === "coat") {
    const cw = tw;
    part(cx - Math.floor(cw / 2), 19, cw, 7, t.a);
    px(cx - Math.floor(cw / 2) + 1, 20, cw - 2, 5, t.b);
    px(cx - 1, 20, 2, 6, t.o, 0.85); // front split
    px(cx - Math.floor(cw / 2) + 1, 20, 1, 5, t.rim, 0.5);
  }

  // emblem / decal / bandolier on the chest (front only)
  if (!back && spec.emblem) {
    px(cx - 2, 14, 4, 3, t.o); // socket
    px(cx - 1, 15, 2, 1, t.e); // compact glowing core
  }
  if (!back && spec.decal && spec.decal !== "none") drawDecal(spec, px, cx, 12);
  if (!back && spec.strap) {
    for (let i = 0; i < 5; i++) px(tx + 1 + i, 12 + i, 2, 1, t.d, 0.9); // bandolier
  }

  // ── neck + head ─────────────────────────────────────────────────
  if (spec.skin != null) {
    const skinT = tonesFromColor(spec.skin);
    px(cx - 1, 10, 3, 2, skinT.b);
    px(cx - 1, 10, 2, 1, skinT.c); // neck
    drawHumanHead(facing, spec, px, part);
  } else drawHead(facing, spec, px, part);

  ctx.restore();
}

/** Hands / hand gear at the sleeve ends — bare skin, neon wraps, studs, gauntlets. */
function drawHands(spec: CharSpec, px: Px, lx: number, ly: number, rx: number, ry: number, t: Tones, acc: Tones) {
  const g = spec.gloves ?? "none";
  const skinT = spec.skin != null ? tonesFromColor(spec.skin) : t;
  const hand = (x: number, y: number, lit: boolean) => {
    if (g === "wraps") {
      px(x, y, 2, 3, t.a);
      px(x, y, 2, 1, acc.e, 0.9);
      px(x, y + 2, 2, 1, acc.d, 0.7); // banded wraps
    } else if (g === "knuckles") {
      px(x, y, 2, 3, t.a);
      px(x, y + 1, 2, 1, acc.e, 0.95); // stud row
    } else if (g === "gauntlets") {
      px(x, y, 2, 4, acc.c);
      px(x, y, 2, 1, acc.e, 0.85);
      px(x, y + 3, 2, 1, acc.b);
    } else {
      px(x, y, 2, 2, lit ? skinT.c : skinT.b); // bare hands
    }
  };
  hand(lx, ly, true);
  hand(rx, ry, false);
}

/** Shoulder armor: pads / spikes / heavy pauldrons over each shoulder. */
function drawShoulders(spec: CharSpec, px: Px, part: Part, tx: number, tw: number) {
  const t = spec.tones;
  const acc = accentOf(spec);
  const lx = tx - 2;
  const rx = tx + tw - 1;
  if (spec.shoulders === "pads") {
    part(lx, 11, 3, 3, t.c);
    part(rx, 11, 3, 3, t.b);
    px(lx + 1, 12, 1, 1, acc.e, 0.85);
    px(rx + 1, 12, 1, 1, acc.d, 0.75);
  } else if (spec.shoulders === "spikes") {
    part(lx, 11, 3, 3, t.b);
    part(rx, 11, 3, 3, t.b);
    px(lx, 8, 1, 4, acc.e);
    px(rx + 2, 8, 1, 4, acc.e);
  } else if (spec.shoulders === "heavy") {
    part(lx - 1, 10, 4, 5, t.c);
    part(rx, 10, 4, 5, t.b);
    px(lx, 11, 2, 1, acc.e, 0.9);
    px(rx + 1, 11, 2, 1, acc.e, 0.85);
    px(lx - 1, 11, 1, 3, acc.rim, 0.75);
  }
}

/** Emissive chest insignia (tints to the signature hue and blooms via the neon FX). */
function drawDecal(spec: CharSpec, px: Px, cx: number, top: number) {
  const e = spec.tones.e;
  const o = spec.tones.o;
  const y = top + 2;
  if (spec.decal === "cross") {
    px(cx - 1, y, 2, 4, e);
    px(cx - 2, y + 1, 4, 2, e);
  } else if (spec.decal === "triangle") {
    px(cx, y, 1, 1, e);
    px(cx - 1, y + 1, 3, 1, e);
    px(cx - 2, y + 2, 5, 2, e);
  } else if (spec.decal === "ring") {
    px(cx - 2, y, 4, 1, e);
    px(cx - 2, y + 3, 4, 1, e);
    px(cx - 2, y, 1, 4, e);
    px(cx + 1, y, 1, 4, e);
  } else if (spec.decal === "bars") {
    px(cx - 2, y, 5, 1, e);
    px(cx - 2, y + 2, 5, 1, e);
    px(cx - 2, y + 4, 5, 1, e);
  } else if (spec.decal === "skull") {
    px(cx - 2, y, 4, 3, e);
    px(cx - 1, y + 3, 2, 1, e);
    px(cx - 2, y + 1, 1, 1, o);
    px(cx + 1, y + 1, 1, 1, o); // dark eye sockets
  } else if (spec.decal === "star") {
    px(cx, y, 1, 1, e);
    px(cx - 1, y + 1, 3, 1, e);
    px(cx - 2, y + 2, 5, 1, e);
    px(cx - 1, y + 3, 1, 2, e);
    px(cx + 1, y + 3, 1, 2, e);
  } else if (spec.decal === "bolt") {
    px(cx, y, 1, 2, e);
    px(cx - 1, y + 2, 3, 1, e);
    px(cx, y + 3, 1, 2, e);
    px(cx - 2, y + 1, 2, 1, e);
  }
}

/** Human head — an 8px adult face: brow, eyes with iris colour, nose, mouth, jaw. */
function drawHumanHead(facing: Facing, spec: CharSpec, px: Px, part: Part) {
  const cx = 16;
  const back = facing === "up";
  const skin = tonesFromColor(spec.skin ?? 0xe0b48a);
  const hair = tonesFromColor(spec.hairColor ?? 0x2a1d14);

  // skull: outline box + jaw taper (chin row narrower than the crown)
  px(cx - 4, 2, 9, 8, skin.o);
  px(cx - 3, 3, 7, 6, skin.b);
  px(cx - 3, 9, 7, 1, skin.o, 0.0); // (kept transparent: jaw defined below)
  px(cx - 2, 9, 5, 1, skin.b); // chin
  px(cx - 2, 3, 4, 1, skin.c, 0.55); // soft forehead light (full-width read as a headband)
  px(cx + 2, 4, 2, 5, skin.a, 0.55); // right side shade
  px(cx - 3, 4, 1, 5, skin.rim, 0.35); // left rim

  if (back) {
    px(cx - 3, 3, 7, 7, skin.a);
    drawHair("up", spec, px, hair);
    drawHumanHeadgear(facing, spec, px, part);
    return;
  }

  // face
  const iris = spec.eyeColor ?? 0x1a1020;
  px(cx - 3, 5, 2, 1, hair.b, 0.9); // left brow
  px(cx + 1, 5, 2, 1, hair.b, 0.9); // right brow
  px(cx - 3, 6, 1, 1, 0xf0f0f5); // eye whites (outer)…
  px(cx + 2, 6, 1, 1, 0xf0f0f5);
  px(cx - 2, 6, 1, 1, iris); // …iris inner
  px(cx + 1, 6, 1, 1, iris);
  px(cx - 3, 7, 3, 1, skin.c, 0.5); // cheek light
  px(cx + 1, 7, 3, 1, skin.a, 0.35); // cheek shade
  px(cx, 7, 1, 1, skin.a, 0.8); // nose
  px(cx - 1, 8, 2, 1, 0x7a4038, 0.8); // mouth
  px(cx - 2, 9, 5, 1, skin.a, 0.4); // jaw shade

  if (spec.beard && spec.beard !== "none") drawBeard(spec, px, cx, hair);
  if (spec.faceMark && spec.faceMark !== "none") drawFaceMark(spec, px, cx, accentOf(spec));
  drawHair(facing, spec, px, hair);
  drawHumanHeadgear(facing, spec, px, part);
}

/** Distinctive face markings — scars, tattoos, chrome lines, war paint. */
function drawFaceMark(spec: CharSpec, px: Px, cx: number, acc: Tones) {
  const mark = spec.faceMark;
  if (mark === "scar") {
    px(cx + 1, 4, 1, 4, 0x8a4a3a, 0.9);
    px(cx + 2, 5, 1, 2, 0xd8a090, 0.6);
  } else if (mark === "tattoo") {
    px(cx - 3, 8, 2, 1, acc.e, 0.9);
    px(cx - 3, 7, 1, 1, acc.d, 0.8); // cheek glyph
  } else if (mark === "chrome") {
    px(cx - 4, 4, 1, 5, acc.e, 0.95); // temple line
    px(cx + 3, 5, 1, 4, acc.d, 0.85);
  } else if (mark === "warpaint") {
    px(cx - 3, 7, 2, 1, acc.e, 0.8);
    px(cx + 2, 7, 2, 1, acc.e, 0.8); // cheek stripes
  }
}

/** Light headgear layered over a human face (cap, hood, helmet rim, etc.). */
function drawHumanHeadgear(facing: Facing, spec: CharSpec, px: Px, _part: Part) {
  if (facing === "up") return;
  const t = spec.tones;
  const cx = 16;
  if (spec.head === "cap") {
    px(cx - 4, 1, 9, 2, t.b);
    px(cx - 4, 3, 9, 1, t.o, 0.8); // brim shadow
    px(cx - 3, 1, 7, 1, t.c);
  } else if (spec.head === "hood") {
    px(cx - 5, 1, 11, 3, t.a);
    px(cx - 5, 3, 1, 6, t.a);
    px(cx + 5, 3, 1, 6, t.a); // cowl frames the face
    px(cx - 4, 2, 9, 1, t.rim, 0.4);
  } else if (spec.head === "helmet") {
    px(cx - 4, 1, 9, 2, t.c);
    px(cx - 3, 0, 7, 2, t.d, 0.5);
  } else if (spec.head === "mohawk") {
    px(cx - 1, 0, 2, 3, t.e);
  } else if (spec.head === "horns") {
    px(cx - 5, 0, 1, 3, t.d);
    px(cx + 4, 0, 1, 3, t.d);
  } else if (spec.head === "crown") {
    px(cx - 4, 1, 9, 1, t.d);
    for (const ox of [-3, 0, 3]) px(cx + ox, 0, 1, 1, t.e);
  } else if (spec.head === "drone") {
    px(cx + 3, 3, 3, 2, t.b);
    px(cx + 4, 3, 1, 1, t.e);
    px(cx + 5, 2, 2, 1, accentOf(spec).e, 0.9); // eye-side optic
  } else if (spec.head === "mask") {
    px(cx - 3, 6, 7, 4, t.a);
    px(cx - 2, 7, 5, 2, t.b);
    px(cx - 2, 7, 1, 1, accentOf(spec).e, 0.95);
    px(cx + 2, 7, 1, 1, accentOf(spec).e, 0.95); // breather lights
  } else if (spec.head === "beret") {
    px(cx - 5, 1, 8, 2, t.b);
    px(cx - 1, 0, 5, 2, t.c); // tilt
  } else if (spec.head === "spikes") {
    for (const ox of [-3, -1, 1, 3]) px(cx + ox, 0, 1, 2, accentOf(spec).e);
  }
}

/** Facial hair on the human face (uses the hair tones). */
function drawBeard(spec: CharSpec, px: Px, cx: number, hair: Tones) {
  if (spec.beard === "stubble") {
    px(cx - 2, 9, 5, 1, hair.a, 0.5);
    px(cx - 2, 8, 1, 1, hair.a, 0.35);
    px(cx + 2, 8, 1, 1, hair.a, 0.35);
  } else if (spec.beard === "mustache") {
    px(cx - 1, 8, 3, 1, hair.b); // covers the lip
  } else if (spec.beard === "goatee") {
    px(cx - 1, 8, 3, 1, hair.b);
    px(cx - 1, 9, 2, 1, hair.b); // chin tuft
  } else if (spec.beard === "full") {
    px(cx - 3, 8, 7, 1, hair.b);
    px(cx - 2, 9, 5, 1, hair.b); // jaw wrap
    px(cx - 1, 8, 2, 1, hair.c, 0.6);
  }
}

/** Hairstyle drawn on top of the head, in the hair tones. */
function drawHair(facing: Facing, spec: CharSpec, px: Px, hair: Tones) {
  if (!spec.hair || spec.hair === "none") return; // bald
  const cx = 16;
  const back = facing === "up";
  if (spec.hair === "mohawk") {
    px(cx - 1, 0, 2, 4, hair.b);
    px(cx - 1, 0, 1, 3, hair.c); // crest, shaved sides
    return;
  }
  // hairline cap over the crown (all other styles)
  px(cx - 4, 2, 9, 2, hair.b);
  px(cx - 3, 2, 7, 1, hair.c);
  px(cx - 4, 4, 1, 2, hair.b);
  px(cx + 4, 4, 1, 2, hair.b); // temples
  if (spec.hair === "long") {
    px(cx - 5, 3, 1, 8, hair.a);
    px(cx + 5, 3, 1, 8, hair.a);
    if (back) {
      px(cx - 4, 3, 9, 8, hair.a);
      px(cx - 3, 4, 3, 6, hair.b, 0.6);
    }
  } else if (spec.hair === "spiky") {
    for (const sx of [cx - 3, cx - 1, cx + 1, cx + 3]) px(sx, 0, 1, 2, hair.c);
  } else if (spec.hair === "bun") {
    px(cx - 1, 0, 3, 2, hair.b);
    px(cx, 0, 1, 1, hair.c);
  } else if (spec.hair === "afro") {
    px(cx - 5, 0, 11, 4, hair.b);
    px(cx - 4, 0, 9, 1, hair.c);
  } else if (spec.hair === "ponytail") {
    if (back) px(cx - 1, 3, 2, 9, hair.a);
    else px(cx + 4, 3, 2, 6, hair.a);
  } else if (spec.hair === "buzz") {
    px(cx - 3, 2, 7, 2, hair.a, 0.8); // tight + darker
  } else if (spec.hair === "braids") {
    px(cx - 5, 3, 1, 8, hair.a);
    px(cx + 5, 3, 1, 8, hair.a);
    px(cx - 5, 10, 1, 1, hair.c);
    px(cx + 5, 10, 1, 1, hair.c); // ties
  } else if (spec.hair === "undercut") {
    px(cx - 4, 4, 1, 3, hair.a, 0.5);
    px(cx + 4, 4, 1, 3, hair.a, 0.5); // shaved sides
    px(cx - 2, 0, 5, 3, hair.b); // top sweep
    px(cx - 1, 0, 3, 1, hair.c);
  } else if (spec.hair === "dreads") {
    for (const ox of [-4, -2, 0, 2, 4]) px(cx + ox, 1, 1, 6 + (ox & 1), hair.b);
    px(cx - 4, 1, 9, 1, hair.b);
  }
  // "short" = just the hairline cap
}

/** Human head in side profile (facing left) — skin, one eye, nose, hair. */
function drawHumanProfile(spec: CharSpec, px: Px, _part: Part) {
  const cx = 15;
  const skin = tonesFromColor(spec.skin ?? 0xe0b48a);
  const hair = tonesFromColor(spec.hairColor ?? 0x2a1d14);
  px(cx - 4, 2, 8, 8, skin.o);
  px(cx - 3, 3, 6, 6, skin.b);
  px(cx - 3, 3, 6, 1, skin.c); // crown light
  px(cx + 1, 4, 2, 5, skin.a, 0.5); // back of skull
  px(cx - 4, 5, 1, 2, skin.b); // nose juts left
  px(cx - 4, 5, 1, 1, skin.c);
  px(cx - 2, 9, 4, 1, skin.b); // jaw
  const iris = spec.eyeColor ?? 0x0a0b12;
  px(cx - 3, 5, 1, 1, hair.b, 0.9); // brow
  px(cx - 3, 6, 1, 1, 0xf0f0f5);
  px(cx - 2, 6, 1, 1, iris); // eye
  px(cx - 3, 8, 2, 1, 0x7a4038, 0.7); // mouth
  if (spec.beard === "stubble") px(cx - 3, 9, 4, 1, hair.a, 0.5);
  else if (spec.beard === "mustache") px(cx - 3, 8, 2, 1, hair.b);
  else if (spec.beard === "goatee") {
    px(cx - 3, 8, 2, 1, hair.b);
    px(cx - 3, 9, 2, 1, hair.b);
  } else if (spec.beard === "full") {
    px(cx - 3, 8, 4, 2, hair.b);
  }
  if (spec.hair && spec.hair !== "none") {
    px(cx - 3, 2, 7, 2, hair.b);
    px(cx - 2, 2, 5, 1, hair.c);
    px(cx + 2, 3, 1, 4, hair.b); // nape
    if (spec.hair === "long") px(cx + 2, 3, 2, 8, hair.a);
    else if (spec.hair === "ponytail") px(cx + 3, 4, 2, 6, hair.a);
    else if (spec.hair === "spiky") for (const sx of [cx - 2, cx, cx + 2]) px(sx, 0, 1, 2, hair.c);
    else if (spec.hair === "afro") px(cx - 4, 0, 9, 4, hair.b);
    else if (spec.hair === "bun") px(cx + 2, 1, 2, 2, hair.b);
    else if (spec.hair === "undercut") {
      px(cx - 3, 0, 5, 3, hair.b);
      px(cx + 1, 3, 1, 4, hair.a, 0.5);
    } else if (spec.hair === "dreads") {
      for (const ox of [-2, 0, 2]) px(cx + ox, 1, 1, 7, hair.b);
    } else if (spec.hair === "mohawk") {
      px(cx - 3, 0, 6, 2, hair.b);
    }
  }
  if (spec.faceMark && spec.faceMark !== "none") {
    const acc = accentOf(spec);
    if (spec.faceMark === "scar") px(cx - 2, 5, 1, 3, 0x8a4a3a, 0.9);
    else if (spec.faceMark === "tattoo") px(cx - 3, 7, 2, 1, acc.e, 0.85);
    else if (spec.faceMark === "chrome") px(cx - 4, 4, 1, 4, acc.e, 0.9);
    else if (spec.faceMark === "warpaint") px(cx - 3, 7, 2, 1, acc.e, 0.7);
  }
  drawProfileHeadgear(spec, px);
}

/** Headgear in profile — mirrors the front set at profile coordinates. */
function drawProfileHeadgear(spec: CharSpec, px: Px) {
  const t = spec.tones;
  const cx = 15;
  if (spec.head === "cap") {
    px(cx - 5, 1, 8, 2, t.b);
    px(cx - 6, 3, 4, 1, t.o, 0.8); // brim juts forward
  } else if (spec.head === "hood") {
    px(cx - 4, 1, 9, 3, t.a);
    px(cx + 3, 3, 1, 6, t.a);
  } else if (spec.head === "helmet") {
    px(cx - 4, 1, 8, 2, t.c);
  } else if (spec.head === "beret") {
    px(cx - 4, 1, 7, 2, t.b);
    px(cx, 0, 4, 2, t.c);
  } else if (spec.head === "mask") {
    px(cx - 4, 6, 5, 3, t.a);
    px(cx - 3, 7, 3, 1, accentOf(spec).e, 0.9);
  } else if (spec.head === "spikes") {
    for (const ox of [-2, 0, 2]) px(cx + ox, 0, 1, 2, accentOf(spec).e);
  } else if (spec.head === "crown") {
    px(cx - 3, 1, 7, 1, t.d);
    px(cx - 2, 0, 1, 1, t.e);
    px(cx + 2, 0, 1, 1, t.e);
  } else if (spec.head === "horns") {
    px(cx - 4, 0, 1, 3, t.d);
  } else if (spec.head === "mohawk") {
    px(cx - 3, 0, 7, 1, t.e);
  }
}

/** Robot / drone head (non-human): compact dome + emissive visor. */
function drawHead(facing: Facing, spec: CharSpec, px: Px, part: Part) {
  const t = spec.tones;
  const cx = 16;
  const back = facing === "up";

  if (spec.antennae) {
    px(cx - 3, 0, 1, 3, t.o);
    px(cx + 2, 0, 1, 3, t.o);
    px(cx - 3, 0, 1, 1, t.e);
    px(cx + 2, 0, 1, 1, t.e);
  }

  // armored neck ring
  px(cx - 1, 10, 3, 2, t.a);

  // dome (10 wide, 9 tall) — crown light, cheek plates, jaw guard
  part(cx - 5, 2, 10, 9, t.b);
  px(cx - 4, 3, 8, 2, t.c);
  px(cx - 3, 3, 5, 1, t.d);
  px(cx + 2, 5, 2, 5, t.a);
  px(cx - 4, 5, 1, 5, t.rim, 0.7);
  px(cx - 1, 1, 3, 2, t.c); // crest ridge
  px(cx, 1, 1, 1, t.d);

  if (spec.head === "mohawk") {
    px(cx - 1, 0, 2, 4, t.e);
  } else if (spec.head === "horns") {
    px(cx - 6, 0, 1, 3, t.d);
    px(cx + 5, 0, 1, 3, t.d);
  } else if (spec.head === "crown") {
    px(cx - 5, 1, 10, 1, t.d);
    for (const ox of [-4, 0, 3]) px(cx + ox, 0, 1, 1, t.e);
  } else if (spec.head === "mask") {
    px(cx - 4, 7, 8, 3, t.a);
    px(cx - 3, 8, 2, 1, accentOf(spec).e);
    px(cx + 1, 8, 2, 1, accentOf(spec).e);
  } else if (spec.head === "beret") {
    px(cx - 6, 1, 9, 2, t.a);
    px(cx - 1, 0, 6, 2, t.c);
  } else if (spec.head === "spikes") {
    for (const ox of [-4, -1, 2]) px(cx + ox, 0, 1, 2, accentOf(spec).e);
  } else if (spec.head === "hood") {
    px(cx - 6, 2, 12, 3, t.a);
    px(cx - 6, 4, 1, 7, t.a);
    px(cx + 5, 4, 1, 7, t.a);
  } else if (spec.head === "cap") {
    px(cx - 5, 5, 10, 1, t.o, 0.8);
    px(cx - 5, 4, 10, 1, t.a);
  }

  if (back) {
    px(cx - 3, 4, 7, 5, t.a);
    px(cx - 3, 9, 7, 1, t.c); // nape light
    return;
  }

  // ── visor (emissive, tints to class hue) ────────────────────────
  if (spec.visor === "goggles") {
    px(cx - 4, 5, 8, 3, t.o);
    px(cx - 3, 6, 2, 1, t.e);
    px(cx + 1, 6, 2, 1, t.e);
    px(cx - 3, 6, 1, 1, 0xffffff, 0.85);
    px(cx, 6, 1, 2, t.o); // nose bridge
  } else if (spec.visor === "single") {
    px(cx - 3, 5, 6, 3, t.o);
    px(cx - 1, 6, 3, 1, t.e);
  } else if (spec.visor === "cross") {
    px(cx - 3, 5, 7, 3, t.o);
    px(cx, 5, 1, 3, t.e);
    px(cx - 2, 6, 5, 1, t.e);
  } else if (spec.visor === "scan") {
    px(cx - 4, 5, 8, 3, t.o);
    px(cx - 3, 6, 1, 1, t.e);
    px(cx - 1, 6, 1, 1, t.e);
    px(cx + 1, 6, 1, 1, t.e);
  } else if (spec.visor === "round") {
    px(cx - 4, 5, 8, 3, t.o);
    px(cx - 3, 6, 2, 1, t.e);
    px(cx + 1, 6, 2, 1, t.e);
  } else {
    // band / wide
    const w = spec.visor === "wide" ? 8 : 7;
    const x = cx - Math.floor(w / 2);
    px(x, 5, w, 3, t.o);
    px(x + 1, 6, w - 2, 1, t.e);
    px(x + 1, 6, 2, 1, 0xffffff, 0.6); // hot streak
    px(x + 1, 7, w - 2, 1, t.e, 0.35); // under-glow
  }
}

/** Side profile (facing left); mirrored in-bake for right. */
function drawProfile(
  spec: CharSpec,
  px: Px,
  part: Part,
  bulk: number,
  step = 0,
) {
  const t = spec.tones;
  const acc = accentOf(spec);
  const cx = 15;
  const sw = walkSwing(step); // front/back legs scissor along the walk axis

  // cape trails behind (to the right, since we face left)
  if (spec.cloak === "cape") {
    part(cx + 1, 12, 5 + Math.max(0, bulk), 14, t.a);
    px(cx + 2, 13, 3, 11, t.b);
    px(cx + 1, 13, 1, 12, t.rim, 0.5);
  }

  // pelvis + legs — scissor along the facing axis, long and tapered
  const tw = 7 + Math.max(0, bulk) - (spec.sex === "f" ? 1 : 0);
  part(cx - 3, 18, tw + 1, 4, t.a);
  // leading leg
  px(cx - 3 - sw * 2, 20, 3, 7, t.o);
  px(cx - 2 - sw * 2, 20, 1, 6, t.a);
  px(cx - 3 - sw * 2, 27, 4, 2, t.o); // boot (toe forward)
  if (spec.legGear === "boots") px(cx - 2 - sw * 2, 27, 2, 1, acc.b);
  // trailing leg
  px(cx + sw * 2, 20, 3, 7, t.o);
  px(cx + 1 + sw * 2, 20, 1, 6, scaleColor(t.a, 0.8));
  px(cx + sw * 2, 27, 3, 2, t.o);
  if (spec.legGear === "wraps") {
    px(cx - 2 - sw * 2, 23, 1, 1, acc.e, 0.9);
    px(cx - 2 - sw * 2, 25, 1, 1, acc.e, 0.75);
  }

  // torso (narrow in profile)
  part(cx - 3, 12, tw, 8, t.b);
  px(cx - 2, 13, 2, 5, t.c); // front-lit chest
  px(cx + tw - 4, 13, 1, 6, t.a); // back shadow
  px(cx - 2, 18, tw - 2, 1, acc.d, 0.6); // belt
  if (spec.emblem) px(cx - 2, 14, 2, 2, t.e, 0.95);
  if (spec.decal && spec.decal !== "none") px(cx - 2, 14, 2, 2, t.e, 0.9); // decal hint
  if (spec.strap) for (let i = 0; i < 4; i++) px(cx - 2 + i, 13 + i, 2, 1, t.d, 0.85);

  // shoulder armor (the visible, leading shoulder)
  if (spec.shoulders && spec.shoulders !== "none") {
    part(cx - 3, 11, 3, 3, spec.shoulders === "pads" ? t.c : t.b);
    if (spec.shoulders === "spikes") px(cx - 3, 8, 1, 3, acc.e);
    if (spec.shoulders === "heavy") {
      part(cx - 4, 10, 4, 5, t.c);
      px(cx - 4, 11, 1, 3, acc.rim, 0.6);
    }
  }

  // coat skirt over the legs
  if (spec.cloak === "coat") {
    part(cx - 3, 19, tw + 1, 6, t.a);
    px(cx - 2, 20, tw - 1, 4, t.b);
    px(cx - 2, 20, 1, 4, t.rim, 0.5);
  }

  // leading arm — swings with the trailing leg
  px(cx - 3 + sw, 13, 2, 6, t.o);
  px(cx - 2 + sw, 14, 1, 4, t.b);
  drawHands(spec, px, cx - 3 + sw, 19, cx - 3 + sw, 19, t, acc);

  // antennae (cyber heads only)
  if (spec.antennae && spec.skin == null) {
    px(cx - 3, 0, 1, 3, t.o);
    px(cx - 3, 0, 1, 1, t.e);
  }

  // neck + head
  if (spec.skin != null) {
    const skinT = tonesFromColor(spec.skin);
    px(cx - 1, 10, 2, 2, skinT.b);
    drawHumanProfile(spec, px, part);
    return;
  }

  // robot head (profile) — visor toward the front (left)
  px(cx - 1, 10, 3, 2, t.a);
  part(cx - 5, 2, 9, 9, t.b);
  px(cx - 4, 3, 7, 2, t.c);
  px(cx + 1, 5, 2, 5, t.a);
  px(cx - 4, 5, 1, 5, t.rim, 0.7);
  px(cx - 1, 1, 3, 2, t.c); // crest

  if (spec.head === "mohawk") {
    px(cx - 2, 0, 6, 1, t.e);
  } else if (spec.head === "horns") {
    px(cx - 5, 0, 1, 3, t.d);
    px(cx + 2, 0, 1, 3, t.d);
  } else if (spec.head === "crown") {
    px(cx - 4, 1, 8, 1, t.d);
    px(cx - 3, 0, 1, 1, t.e);
    px(cx + 1, 0, 1, 1, t.e);
  } else if (spec.head === "mask") {
    px(cx - 5, 6, 6, 3, t.a);
    px(cx - 4, 7, 4, 1, accentOf(spec).e, 0.85);
  } else if (spec.head === "beret") {
    px(cx - 5, 1, 7, 2, t.c);
  } else if (spec.head === "spikes") {
    px(cx - 3, 0, 1, 2, accentOf(spec).e);
    px(cx, 0, 1, 2, accentOf(spec).e);
  } else if (spec.head === "hood") {
    px(cx - 6, 2, 11, 3, t.a);
    px(cx - 6, 4, 1, 6, t.c);
  } else if (spec.head === "cap") {
    px(cx - 6, 5, 8, 1, t.o, 0.8);
    px(cx - 6, 4, 8, 1, t.a);
  }

  if (spec.visor === "goggles") {
    px(cx - 5, 5, 6, 3, t.o);
    px(cx - 4, 6, 2, 1, t.e);
    px(cx - 1, 6, 2, 1, t.e);
  } else if (spec.visor === "single") {
    px(cx - 5, 5, 5, 3, t.o);
    px(cx - 4, 6, 2, 1, t.e);
  } else {
    px(cx - 5, 5, 7, 3, t.o);
    px(cx - 4, 6, 5, 1, t.e);
    px(cx - 4, 6, 2, 1, t.d);
  }
}

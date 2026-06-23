// METROPHAGE — code-authored characters, drawn parametrically at 32×32 (4× the
// detail of the old 16×16 char maps). Same top-down 3/4 view; frame order matches
// faceFrame(): [down, left, right, up], where `right` is `left` mirrored.
//
// Player / Cop / Boss are drawn GRAYSCALE so the in-scene setTint() recolors them
// (white visor → bright class hue, darks stay dark). The NPC carries its own hues.
// The bright "emissive" tone is pure white so it tints to the class color and the
// neon post-FX blooms it.

export const CHAR = 32; // native px per character frame

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
export type Head = "helmet" | "hood" | "cap" | "drone" | "mohawk" | "horns" | "crown";
export type Visor = "band" | "goggles" | "single" | "wide" | "cross" | "scan" | "round";
export type Shoulders = "none" | "pads" | "spikes" | "heavy";
export type Decal = "none" | "cross" | "triangle" | "ring" | "bars" | "skull";
export type Cloak = "none" | "cape" | "coat";

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
}

// ── Per-class player specs (ids match game/classes.ts) ──────────────────────
export const PLAYER_SPECS: Record<string, CharSpec> = {
  // sleek cyber-operative, visor band
  wintermute: { build: "normal", head: "helmet", visor: "band", tones: GRAY },
  // hazmat infector — hooded, twin goggle lenses, glowing chest emblem
  metrophage: { build: "bulky", head: "hood", visor: "goggles", emblem: true, tones: GRAY },
  // street militant — capped brim, diagonal bandolier
  "k-guerilla": { build: "normal", head: "cap", visor: "band", strap: true, tones: GRAY },
  // drone-host — slim, twin antennae, single focused optic
  swarm: { build: "slim", head: "drone", visor: "single", antennae: true, tones: GRAY },
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
  antennae: true,
  collar: true,
  tones: GREEN,
};

const hex = (c: number) => "#" + (c & 0xffffff).toString(16).padStart(6, "0");

/** Agent cell size — the ambient crowd is smaller/lighter than the player. */
export const AGENT_W = 16;
export const AGENT_H = 22;

/** A compact grayscale civilian for the ambient crowd (tinted per-instance). */
export function drawAgent(ctx: CanvasRenderingContext2D) {
  const t = GRAY;
  const px = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = hex(c);
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  };
  const part = (x: number, y: number, w: number, h: number, fill: number) => {
    px(x, y, w, h, t.o);
    px(x + 1, y + 1, w - 2, h - 2, fill);
  };
  px(2, 20, 12, 1, 0x000000, 0.25); // shadow
  // legs
  part(5, 16, 3, 5, t.b);
  part(8, 16, 3, 5, t.a);
  // body
  part(3, 9, 10, 8, t.b);
  px(5, 10, 5, 5, t.c); // front light
  px(11, 10, 1, 6, t.a);
  // arms
  part(2, 10, 2, 6, t.b);
  part(12, 10, 2, 6, t.b);
  // head
  part(4, 2, 8, 8, t.b);
  px(5, 3, 6, 2, t.c);
  px(5, 3, 4, 1, t.d);
  px(5, 6, 6, 1, t.e, 0.85); // faint visor glow
}

/**
 * Draw one character frame into `ctx` (already translated so 0,0 is the frame's
 * top-left). Frame index → facing via FACINGS; `right` is drawn as a mirrored
 * `left`. Coordinates assume a 32×32 cell.
 */
export function drawCharacter(ctx: CanvasRenderingContext2D, frame: number, spec: CharSpec) {
  const facing = FACINGS[frame] ?? "down";
  if (facing === "right") {
    ctx.save();
    ctx.translate(CHAR, 0);
    ctx.scale(-1, 1);
    drawPose(ctx, "left", spec);
    ctx.restore();
    return;
  }
  drawPose(ctx, facing, spec);
}

function drawPose(ctx: CanvasRenderingContext2D, facing: Facing, spec: CharSpec) {
  const t = spec.tones;
  const px = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = hex(c);
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  };
  // outline a block then inset-fill it (clean 1px silhouette edge)
  const part = (x: number, y: number, w: number, h: number, fill: number) => {
    px(x, y, w, h, t.o);
    px(x + 1, y + 1, w - 2, h - 2, fill);
  };

  // bulk widens the torso/shoulders
  const bulk = spec.build === "huge" ? 4 : spec.build === "bulky" ? 2 : spec.build === "slim" ? -2 : 0;
  const cx = 16;

  // ── ground shadow ───────────────────────────────────────────────
  px(cx - 7, 28, 14, 2, 0x000000, 0.26);
  px(cx - 5, 29, 10, 1, 0x000000, 0.22);

  if (facing === "left") {
    drawProfile(spec, px, part, bulk);
    return;
  }

  const back = facing === "up";

  // ── cloak: a cape drapes BEHIND the body (drawn first) ──────────
  if (spec.cloak === "cape") {
    const cw = 16 + bulk;
    if (back) {
      part(cx - cw / 2, 13, cw, 16, t.a); // full cape down the back
      px(cx - cw / 2 + 1, 14, cw - 2, 13, t.b);
      px(cx - 1, 14, 2, 14, t.a, 0.7); // centre fold
      px(cx - cw / 2 + 1, 14, 1, 13, t.rim, 0.6); // edge rim-light
    } else {
      px(cx - cw / 2, 13, 2, 16, t.a); // edges peek past the shoulders
      px(cx + cw / 2 - 2, 13, 2, 16, t.a);
      px(cx - cw / 2, 13, 1, 16, t.rim, 0.5);
    }
  }

  // ── legs (clear stance, dark gap between) ───────────────────────
  for (const lx of [cx - 6, cx + 2]) {
    part(lx, 23, 5, 6, t.b); // 3px-fill leg
    px(lx + 1, 24, 3, 3, t.c); // shin highlight
    px(lx + 1, 28, 3, 1, t.a); // boot shadow
  }
  px(cx - 1, 23, 2, 5, t.o); // dark gap so the legs read as two

  // ── torso + shoulders (horizontal light banding, not vertical bars) ──
  const tw = 14 + bulk; // torso width
  const tx = cx - tw / 2;
  part(tx - 1, 12, tw + 2, 5, t.b); // shoulder yoke
  px(tx, 13, tw, 1, t.c); // lit shoulder top
  px(tx, 14, tw, 1, t.d, 0.6); // shoulder highlight
  part(tx, 16, tw, 8, t.b); // torso
  if (!back) {
    px(tx + 1, 17, tw - 2, 2, t.c); // upper-chest light band
    px(tx + 1, 22, tw - 2, 1, t.a); // lower-belly shadow band
    px(cx - 2, 18, 1, 4, t.a, 0.6); // soft centre groove (short, not full height)
  } else {
    px(tx + 1, 17, tw - 2, 6, t.a); // back is shadowed
    px(tx + 1, 16, tw - 2, 1, t.c); // nape light
    part(cx - 3, 18, 6, 5, t.a); // backpack housing
    px(cx - 2, 19, 4, 1, t.rim, 0.8); // pack rim light
  }

  // arms at the sides
  part(tx - 3, 15, 3, 8, t.b);
  part(tx + tw, 15, 3, 8, t.b);
  px(tx - 2, 16, 1, 5, t.c); // left arm catches light
  px(tx + tw + 1, 17, 1, 5, t.a); // right arm in shadow

  // ── shoulder armor (over the arms/yoke) ─────────────────────────
  if (spec.shoulders && spec.shoulders !== "none") drawShoulders(spec, px, part, tx, tw);

  // ── coat: a skirt drapes OVER the legs (after the torso) ────────
  if (spec.cloak === "coat") {
    const cw = tw + 2;
    part(cx - cw / 2, 22, cw, 8, t.a);
    px(cx - cw / 2 + 1, 23, cw - 2, 6, t.b);
    px(cx - 1, 23, 2, 6, t.o, 0.85); // front split
    if (!back) px(cx - cw / 2 + 1, 23, cw - 2, 1, t.c); // belt line
    px(cx - cw / 2 + 1, 23, 1, 6, t.rim, 0.5);
  }

  // emblem / decal / bandolier on the chest (front only)
  if (!back && spec.emblem) {
    px(cx - 2, 18, 4, 4, t.o); // socket
    px(cx - 1, 19, 2, 2, t.e); // compact glowing core
  }
  if (!back && spec.decal && spec.decal !== "none") drawDecal(spec, px, cx, 16);
  if (!back && spec.strap) {
    for (let i = 0; i < 6; i++) px(tx + 2 + i, 16 + i, 2, 1, t.d, 0.9); // bandolier
  }

  // ── head ────────────────────────────────────────────────────────
  drawHead(facing, spec, px, part);
}

type Px = (x: number, y: number, w: number, h: number, c: number, a?: number) => void;
type Part = (x: number, y: number, w: number, h: number, fill: number) => void;

/** Shoulder armor: pads / spikes / heavy pauldrons over each shoulder. */
function drawShoulders(spec: CharSpec, px: Px, part: Part, tx: number, tw: number) {
  const t = spec.tones;
  const lx = tx - 4;
  const rx = tx + tw + 1;
  if (spec.shoulders === "pads") {
    part(lx, 13, 4, 4, t.c);
    part(rx, 13, 4, 4, t.b);
    px(lx + 1, 14, 2, 1, t.d);
  } else if (spec.shoulders === "spikes") {
    part(lx, 13, 4, 3, t.b);
    part(rx, 13, 4, 3, t.b);
    px(lx, 10, 1, 4, t.d);
    px(lx + 2, 11, 1, 3, t.c); // jutting spikes
    px(rx + 3, 10, 1, 4, t.d);
    px(rx + 1, 11, 1, 3, t.c);
  } else if (spec.shoulders === "heavy") {
    part(lx - 1, 12, 5, 6, t.c);
    part(rx, 12, 5, 6, t.b);
    px(lx, 13, 3, 1, t.d);
    px(lx - 1, 13, 1, 5, t.rim, 0.6);
  }
}

/** Emissive chest insignia (tints to the signature hue and blooms via the neon FX). */
function drawDecal(spec: CharSpec, px: Px, cx: number, top: number) {
  const e = spec.tones.e;
  const o = spec.tones.o;
  const y = top + 2;
  if (spec.decal === "cross") {
    px(cx - 1, y, 2, 5, e);
    px(cx - 2, y + 1, 4, 2, e);
  } else if (spec.decal === "triangle") {
    px(cx, y, 1, 1, e);
    px(cx - 1, y + 1, 3, 1, e);
    px(cx - 2, y + 2, 5, 1, e);
    px(cx - 2, y + 3, 5, 1, e);
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
  }
}

/** Head + headgear for the down / up facings. */
function drawHead(
  facing: Facing,
  spec: CharSpec,
  px: (x: number, y: number, w: number, h: number, c: number, a?: number) => void,
  part: (x: number, y: number, w: number, h: number, fill: number) => void,
) {
  const t = spec.tones;
  const cx = 16;
  const back = facing === "up";

  // antennae poke up behind the head
  if (spec.antennae) {
    px(cx - 4, 1, 1, 4, t.o);
    px(cx + 3, 1, 1, 4, t.o);
    px(cx - 4, 1, 1, 1, t.e);
    px(cx + 3, 1, 1, 1, t.e);
  }

  // helmet / head dome (10 wide)
  part(cx - 6, 3, 12, 11, t.b);
  px(cx - 5, 4, 10, 2, t.c); // lit crown
  px(cx - 4, 4, 8, 1, t.d); // crown highlight
  px(cx + 3, 6, 2, 7, t.a); // right side shadow
  px(cx - 5, 6, 1, 7, t.rim, 0.7); // cool rim on the left

  // crest ridge
  px(cx - 1, 2, 3, 2, t.c);
  px(cx, 2, 1, 1, t.d);

  // ── extra headgear that layers on the dome (front + back) ───────
  if (spec.head === "mohawk") {
    px(cx - 1, 0, 2, 6, t.e); // emissive crest fin running front→back
    px(cx - 1, 1, 1, 4, t.d);
  } else if (spec.head === "horns") {
    px(cx - 7, 1, 1, 3, t.d);
    px(cx - 6, 2, 1, 2, t.c); // left horn
    px(cx + 6, 1, 1, 3, t.d);
    px(cx + 5, 2, 1, 2, t.c); // right horn
  } else if (spec.head === "crown") {
    px(cx - 6, 2, 12, 1, t.d); // band
    px(cx - 5, 0, 1, 2, t.e);
    px(cx - 1, 0, 1, 2, t.e);
    px(cx + 4, 0, 1, 2, t.e); // emissive spikes
  }

  if (spec.head === "hood") {
    // cowl framing the face
    part(cx - 7, 3, 14, 9, t.a);
    px(cx - 6, 4, 12, 1, t.b);
    px(cx - 6, 4, 1, 8, t.c);
  } else if (spec.head === "cap") {
    // forward brim shading the upper face
    px(cx - 6, 7, 12, 1, t.o);
    px(cx - 6, 6, 12, 1, t.a);
  }

  if (back) {
    // back of the head — no visor, just a shaded skull + a nape light
    px(cx - 4, 6, 8, 6, t.a);
    px(cx - 4, 11, 8, 1, t.c);
    if (spec.head === "helmet" || spec.head === "cap") px(cx - 3, 5, 6, 1, t.rim, 0.6);
    return;
  }

  // face recess under the visor
  px(cx - 4, 11, 8, 2, t.a);

  // ── visor (emissive, tints to class hue) ────────────────────────
  if (spec.visor === "goggles") {
    px(cx - 5, 7, 10, 4, t.o); // housing
    px(cx - 4, 8, 3, 2, t.e); // left lens
    px(cx + 1, 8, 3, 2, t.e); // right lens
    px(cx - 4, 8, 1, 1, t.e);
    px(cx + 1, 8, 1, 1, t.e); // hot specks
  } else if (spec.visor === "single") {
    px(cx - 4, 7, 8, 3, t.o);
    px(cx - 2, 8, 4, 1, t.e); // narrow focused optic
    px(cx - 2, 8, 1, 1, t.d);
  } else if (spec.visor === "cross") {
    px(cx - 4, 7, 8, 4, t.o); // housing
    px(cx - 1, 7, 2, 4, t.e); // vertical bar
    px(cx - 3, 8, 6, 2, t.e); // horizontal bar
    px(cx - 1, 8, 1, 1, t.d);
  } else if (spec.visor === "scan") {
    px(cx - 5, 7, 10, 4, t.o);
    px(cx - 4, 8, 1, 2, t.e);
    px(cx - 1, 8, 1, 2, t.e);
    px(cx + 2, 8, 1, 2, t.e); // three scanner bars
    px(cx - 4, 8, 1, 1, t.d);
  } else if (spec.visor === "round") {
    px(cx - 5, 7, 10, 4, t.o);
    px(cx - 4, 8, 2, 2, t.e);
    px(cx + 2, 8, 2, 2, t.e); // twin round lenses
    px(cx - 4, 8, 1, 1, t.d);
    px(cx + 2, 8, 1, 1, t.d);
  } else {
    // band / wide
    const w = spec.visor === "wide" ? 10 : 9;
    const x = cx - w / 2;
    px(x, 7, w, 4, t.o); // recessed housing
    px(x + 1, 8, w - 2, 2, t.e); // glowing band
    px(x + 1, 8, 2, 1, t.d); // reflection
    px(x + w - 3, 9, 2, 1, t.a, 0.7);
  }
}

/** Side profile (facing left); mirrored in-bake for right. */
function drawProfile(
  spec: CharSpec,
  px: (x: number, y: number, w: number, h: number, c: number, a?: number) => void,
  part: (x: number, y: number, w: number, h: number, fill: number) => void,
  bulk: number,
) {
  const t = spec.tones;
  const cx = 15;

  // cape trails behind (to the right, since we face left)
  if (spec.cloak === "cape") {
    part(cx + 2, 13, 5 + Math.max(0, bulk), 16, t.a);
    px(cx + 3, 14, 3, 13, t.b);
    px(cx + 2, 14, 1, 14, t.rim, 0.5);
  }

  // legs — front + trailing
  part(cx - 1, 23, 4, 6, t.b);
  part(cx + 3, 23, 4, 6, t.a); // trailing leg, shadowed
  px(cx, 24, 1, 4, t.c);

  // torso (narrower in profile), facing left
  const tw = 9 + Math.max(0, bulk);
  part(cx - 3, 13, tw, 4, t.b); // shoulder
  px(cx - 3, 14, tw, 1, t.c);
  part(cx - 3, 16, tw, 8, t.b);
  px(cx - 2, 17, 4, 6, t.c); // front-lit chest
  px(cx + tw - 4, 17, 1, 6, t.a); // back shadow
  if (spec.emblem) px(cx - 2, 18, 3, 3, t.e, 0.95);
  if (spec.decal && spec.decal !== "none") px(cx - 2, 18, 2, 3, t.e, 0.9); // decal hint
  if (spec.strap) for (let i = 0; i < 5; i++) px(cx - 2 + i, 16 + i, 2, 1, t.d, 0.85);

  // shoulder armor (the visible, leading shoulder)
  if (spec.shoulders && spec.shoulders !== "none") {
    part(cx - 4, 12, 4, 4, spec.shoulders === "pads" ? t.c : t.b);
    if (spec.shoulders === "spikes") px(cx - 4, 9, 1, 4, t.d);
    if (spec.shoulders === "heavy") {
      part(cx - 5, 11, 5, 6, t.c);
      px(cx - 5, 12, 1, 5, t.rim, 0.6);
    }
  }

  // coat skirt over the legs
  if (spec.cloak === "coat") {
    part(cx - 3, 22, tw + 2, 8, t.a);
    px(cx - 2, 23, tw, 6, t.b);
    px(cx - 2, 23, 1, 6, t.rim, 0.5);
  }

  // leading arm
  part(cx - 4, 16, 3, 8, t.b);
  px(cx - 3, 17, 1, 6, t.c);

  // antennae
  if (spec.antennae) {
    px(cx - 4, 1, 1, 4, t.o);
    px(cx - 4, 1, 1, 1, t.e);
  }

  // head (profile) — nose/brow to the left
  part(cx - 6, 3, 11, 11, t.b);
  px(cx - 5, 4, 9, 2, t.c);
  px(cx - 5, 4, 7, 1, t.d);
  px(cx + 2, 6, 2, 7, t.a); // back of skull shadow
  px(cx - 6, 6, 1, 6, t.rim, 0.7);
  px(cx - 1, 2, 3, 2, t.c); // crest

  // extra headgear (profile)
  if (spec.head === "mohawk") {
    px(cx - 2, 1, 6, 1, t.e);
    px(cx - 2, 2, 5, 1, t.d); // crest along the crown
  } else if (spec.head === "horns") {
    px(cx - 6, 1, 1, 3, t.d);
    px(cx + 3, 1, 1, 3, t.d);
  } else if (spec.head === "crown") {
    px(cx - 5, 2, 9, 1, t.d);
    px(cx - 4, 0, 1, 2, t.e);
    px(cx + 1, 0, 1, 2, t.e);
  }

  if (spec.head === "hood") {
    part(cx - 7, 3, 13, 9, t.a);
    px(cx - 6, 4, 1, 8, t.c);
  } else if (spec.head === "cap") {
    px(cx - 7, 7, 9, 1, t.o); // brim juts forward
    px(cx - 7, 6, 9, 1, t.a);
  }

  // visor — toward the front (left)
  if (spec.visor === "goggles") {
    px(cx - 6, 7, 7, 4, t.o);
    px(cx - 5, 8, 3, 2, t.e);
    px(cx - 1, 8, 2, 2, t.e);
  } else if (spec.visor === "single") {
    px(cx - 6, 7, 6, 3, t.o);
    px(cx - 5, 8, 3, 1, t.e);
  } else {
    px(cx - 6, 7, 8, 4, t.o);
    px(cx - 5, 8, 6, 2, t.e);
    px(cx - 5, 8, 2, 1, t.d);
  }
}

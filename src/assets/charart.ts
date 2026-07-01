// METROPHAGE — code-authored characters, drawn parametrically at 32×32 (4× the
// detail of the old 16×16 char maps). Same top-down 3/4 view; frame order matches
// faceFrame(): [down, left, right, up], where `right` is `left` mirrored.
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
  const part = (x: number, y: number, w: number, h: number, fill: number) => {
    px(x, y, w, h, t.o);
    px(x + 1, y + 1, w - 2, h - 2, fill);
  };
  px(2, 20, 12, 1, 0x000000, 0.25); // shadow
  // legs — alternate fore/aft on the shuffle
  part(5, 16 - sw, 3, 5, t.b);
  part(8, 16 + sw, 3, 5, t.a);
  // body
  part(3, 9, 10, 8, t.b);
  px(5, 10, 5, 5, t.c); // front light
  px(11, 10, 1, 6, t.a);
  // arms
  part(2, 10, 2, 6, t.b);
  part(12, 10, 2, 6, t.b);
  // head — human face (tinted with the crowd colour)
  part(4, 2, 8, 8, t.b);
  px(5, 3, 6, 2, t.c);
  px(5, 3, 4, 1, t.d);
  px(5, 5, 2, 1, t.o);
  px(9, 5, 2, 1, t.o);
  px(6, 7, 4, 1, t.a, 0.75);
  px(4, 1, 8, 2, t.a);
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

function drawPose(ctx: CanvasRenderingContext2D, facing: Facing, spec: CharSpec, step = 0) {
  const t = spec.tones;
  const acc = accentOf(spec);
  const sw = walkSwing(step); // -1..1 stride phase; legs/arms offset oppositely
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
  const fem = spec.sex === "f"; // a slimmer torso + bust; men get broader shoulders

  // ── ground shadow ───────────────────────────────────────────────
  px(cx - 7, 28, 14, 2, 0x000000, 0.26);
  px(cx - 5, 29, 10, 1, 0x000000, 0.22);

  if (facing === "left") {
    drawProfile(spec, px, part, bulk, step);
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

  // ── legs — feet alternate on the stride; knee + boot definition ──
  const legDy = [-sw * 2, sw * 2]; // left foot lifts forward as the right plants
  [cx - 6, cx + 2].forEach((lx, i) => {
    const dy = legDy[i];
    part(lx, 23 + dy, 5, 6, t.b); // thigh + shin
    px(lx + 1, 24 + dy, 3, 2, t.c); // knee/shin highlight
    px(lx, 23 + dy, 1, 4, t.rim, 0.4); // outer rim light
    if (spec.legGear === "wraps") {
      px(lx, 24 + dy, 1, 4, acc.e, 0.85);
      px(lx + 4, 24 + dy, 1, 4, acc.e, 0.85); // neon leg wraps
      px(lx + 1, 25 + dy, 3, 1, acc.d, 0.7);
    } else if (spec.legGear === "greaves") {
      part(lx, 24 + dy, 5, 3, acc.c);
      px(lx + 1, 24 + dy, 3, 1, acc.e, 0.9); // plated shinguards
      px(lx, 24 + dy, 1, 3, acc.rim, 0.65);
    }
    const bootH = spec.legGear === "boots" ? 3 : 2;
    part(lx + 1, 27 + dy - (bootH - 2), 4, bootH, spec.legGear === "boots" ? acc.b : t.a);
    px(lx + 1, 27 + dy, 4, 1, spec.legGear === "boots" ? acc.e : t.c, spec.legGear === "boots" ? 0.75 : 0.45);
    if (spec.legGear === "boots") {
      px(lx + 1, 28 + dy, 4, 1, acc.d, 0.8); // heavy tread sole
      px(lx + 3, 28 + dy, 2, 1, acc.e, 0.55);
    }
    px(lx + 3, 28 + dy, 2, 1, t.o); // toe shadow
  });
  px(cx - 1, 23, 2, 5, t.o); // dark gap so the legs read as two

  // ── torso — street jacket for humans, armored plating for drones ──
  const tw = 14 + bulk - (fem ? 2 : 0);
  const tx = cx - tw / 2;
  const human = spec.skin != null;
  if (human) {
    part(tx - 1, 12, tw + 2, 4, t.b);
    if (spec.sex === "m") {
      px(tx - 2, 13, 1, 2, t.b);
      px(tx + tw + 1, 13, 1, 2, t.b);
    }
    px(tx, 12, tw, 1, t.c);
    part(tx, 16, tw, 8, t.b);
    if (!back) {
      px(tx + 1, 16, 1, 6, t.rim, 0.35);
      px(tx + 2, 17, tw - 4, 3, t.c);
      px(cx - 1, 16, 2, 3, t.d, 0.55);
      px(tx + 1, 21, tw - 2, 2, t.a);
      px(tx, 23, tw, 1, t.o, 0.45);
      if (fem) {
        px(cx - 3, 18, 2, 1, t.d, 0.5);
        px(cx + 1, 18, 2, 1, t.d, 0.5);
        px(tx + 1, 21, 1, 2, t.a, 0.55);
        px(tx + tw - 2, 21, 1, 2, t.a, 0.55);
      }
    } else {
      px(tx + 1, 17, tw - 2, 6, t.a);
      px(tx + 1, 16, tw - 2, 1, t.c);
      px(cx, 17, 1, 5, t.o, 0.4);
    }
  } else {
    part(tx - 1, 12, tw + 2, 5, t.b);
    if (spec.sex === "m") {
      px(tx - 2, 13, 1, 3, t.b);
      px(tx + tw + 1, 13, 1, 3, t.b);
    }
    px(tx, 13, tw, 1, t.c);
    px(tx, 14, tw, 1, t.d, 0.6);
    px(tx + 1, 13, 1, 1, t.d);
    px(tx + tw - 2, 13, 1, 1, t.d);
    part(tx, 16, tw, 8, t.b);
    if (!back) {
      px(tx + 1, 16, 1, 7, t.rim, 0.45);
      px(tx + tw - 2, 16, 1, 7, t.a);
      px(tx + 2, 17, tw - 4, 2, t.c);
      px(cx - 3, 17, 6, 1, t.d, 0.45);
      px(cx - 1, 18, 2, 4, t.a, 0.6);
      px(cx - 4, 19, 2, 2, t.b);
      px(cx + 2, 19, 2, 2, t.b);
      px(tx + 1, 22, tw - 2, 1, t.a);
      px(tx, 23, tw, 1, t.o, 0.55);
      px(cx - 2, 22, 4, 2, t.c, 0.7);
      if (fem) {
        px(cx - 4, 18, 2, 1, t.d, 0.6);
        px(cx + 2, 18, 2, 1, t.d, 0.6);
        px(tx, 21, 1, 2, t.a, 0.6);
        px(tx + tw - 1, 21, 1, 2, t.a, 0.6);
      }
    } else {
      px(tx + 1, 17, tw - 2, 6, t.a);
      px(tx + 1, 16, tw - 2, 1, t.c);
      px(cx, 17, 1, 6, t.o, 0.5);
      part(cx - 3, 18, 6, 5, t.a);
      px(cx - 2, 19, 4, 1, t.rim, 0.8);
      px(cx - 2, 21, 4, 1, t.o, 0.6);
    }
  }

  // arms + gloved fists — swing opposite the legs for a natural gait
  const laY = 15 + sw;
  const raY = 15 - sw;
  part(tx - 3, laY, 3, 8, t.b); // left arm
  part(tx + tw, raY, 3, 8, t.b); // right arm
  px(tx - 2, laY + 1, 1, 5, t.c); // left arm catches light
  px(tx + tw + 1, raY + 1, 1, 5, t.a); // right arm in shadow
  px(tx - 2, laY + 3, 1, 1, t.a); // elbow crease L
  px(tx + tw + 1, raY + 3, 1, 1, t.a); // elbow crease R
  drawGloves(spec, px, part, tx - 3, laY + 7, tx + tw, raY + 7, t, acc);

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

  // ── neck + head (humanoid) ──────────────────────────────────────
  if (spec.skin != null) {
    const skinT = tonesFromColor(spec.skin);
    part(cx - 2, 11, 4, 4, skinT.b);
    px(cx - 1, 11, 2, 3, skinT.c);
    drawHumanHead(facing, spec, px, part);
  } else drawHead(facing, spec, px, part);
}

type Px = (x: number, y: number, w: number, h: number, c: number, a?: number) => void;
type Part = (x: number, y: number, w: number, h: number, fill: number) => void;

/** Hand gear — bare gloves, neon wraps, studded knuckles, or heavy gauntlets. */
function drawGloves(
  spec: CharSpec,
  px: Px,
  part: Part,
  lx: number,
  ly: number,
  rx: number,
  ry: number,
  t: Tones,
  acc: Tones,
) {
  const g = spec.gloves ?? "none";
  const drawHand = (x: number, y: number, lit: boolean) => {
    if (g === "wraps") {
      part(x, y, 3, 4, t.a);
      px(x, y, 1, 4, acc.e, 0.9);
      px(x + 2, y, 1, 4, acc.e, 0.9);
      px(x + 1, y + 1, 1, 2, acc.d, 0.65);
    } else if (g === "knuckles") {
      part(x, y, 3, 4, t.b);
      px(x, y + 1, 3, 1, acc.e, 0.95); // studded knuckle row
      px(x, y + 2, 1, 1, acc.d);
      px(x + 2, y + 2, 1, 1, acc.d);
      px(x + 1, y, 1, 1, lit ? t.c : t.a, 0.6);
    } else if (g === "gauntlets") {
      part(x, y, 3, 5, acc.c);
      px(x, y, 1, 5, acc.rim, 0.7);
      px(x + 1, y, 2, 1, acc.e, 0.85);
      px(x + 1, y + 2, 2, 2, acc.b);
      px(x + 1, y + 3, 2, 1, acc.d, 0.75);
    } else {
      part(x, y, 3, 4, t.a);
      px(x + 1, y, 2, 1, lit ? t.c : t.a, 0.5);
      px(x + 1, y + 2, 1, 1, t.rim, 0.55);
    }
  };
  drawHand(lx, ly, true);
  drawHand(rx, ry, false);
}

/** Shoulder armor: pads / spikes / heavy pauldrons over each shoulder. */
function drawShoulders(spec: CharSpec, px: Px, part: Part, tx: number, tw: number) {
  const t = spec.tones;
  const acc = accentOf(spec);
  const lx = tx - 4;
  const rx = tx + tw + 1;
  if (spec.shoulders === "pads") {
    part(lx, 13, 4, 4, t.c);
    part(rx, 13, 4, 4, t.b);
    px(lx + 1, 14, 2, 1, acc.e, 0.85);
    px(rx + 1, 14, 2, 1, acc.d, 0.75);
    px(lx, 13, 1, 4, acc.rim, 0.55);
  } else if (spec.shoulders === "spikes") {
    part(lx, 13, 4, 3, t.b);
    part(rx, 13, 4, 3, t.b);
    px(lx, 9, 1, 5, acc.e);
    px(lx + 2, 10, 1, 4, acc.d);
    px(rx + 3, 9, 1, 5, acc.e);
    px(rx + 1, 10, 1, 4, acc.d);
    px(lx + 1, 13, 2, 1, acc.c, 0.8);
    px(rx + 1, 13, 2, 1, acc.c, 0.8);
  } else if (spec.shoulders === "heavy") {
    part(lx - 1, 12, 5, 6, t.c);
    part(rx, 12, 5, 6, t.b);
    px(lx, 13, 3, 1, acc.e, 0.9);
    px(lx - 1, 13, 1, 5, acc.rim, 0.75);
    px(rx + 1, 13, 3, 1, acc.e, 0.85);
    px(rx + 4, 13, 1, 5, acc.rim, 0.65);
    px(lx + 1, 14, 2, 3, acc.b, 0.55);
    px(rx + 2, 14, 2, 3, acc.b, 0.55);
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

/** Human head — skin face with eyes (no cyber visor) + hair, for down/up facings. */
function drawHumanHead(facing: Facing, spec: CharSpec, px: Px, part: Part) {
  const cx = 16;
  const back = facing === "up";
  const skin = tonesFromColor(spec.skin ?? 0xe0b48a);
  const hair = tonesFromColor(spec.hairColor ?? 0x2a1d14);

  // skull / head in skin — readable human face (not a visor dome)
  part(cx - 6, 2, 12, 13, skin.b);
  px(cx - 5, 3, 10, 4, skin.c);
  px(cx - 5, 3, 7, 1, skin.d);
  px(cx + 3, 5, 2, 9, skin.a);
  px(cx - 6, 5, 1, 8, skin.rim, 0.55);

  if (back) {
    px(cx - 5, 4, 10, 10, skin.a);
    drawHair("up", spec, px, hair);
    drawHumanHeadgear(facing, spec, px, part);
    return;
  }

  // face — cheeks, eyes, nose, mouth
  px(cx - 5, 8, 10, 7, skin.b);
  px(cx - 5, 8, 5, 5, skin.c, 0.75);
  px(cx + 2, 9, 3, 5, skin.a, 0.45);
  px(cx - 4, 9, 2, 2, skin.d, 0.35);
  px(cx - 5, 14, 10, 1, skin.a);
  const iris = spec.eyeColor ?? 0x1a1020;
  const irisHi = scaleColor(iris, 1.35);
  px(cx - 4, 9, 3, 3, 0xf5f5fa);
  px(cx + 1, 9, 3, 3, 0xf5f5fa);
  px(cx - 3, 10, 2, 2, iris);
  px(cx + 2, 10, 2, 2, iris);
  px(cx - 3, 10, 1, 1, irisHi, 0.7);
  px(cx + 2, 10, 1, 1, irisHi, 0.7);
  px(cx - 3, 9, 1, 1, 0xffffff, 0.9);
  px(cx + 2, 9, 1, 1, 0xffffff, 0.9);
  px(cx - 3, 8, 3, 1, hair.b);
  px(cx + 1, 8, 3, 1, hair.b);
  px(cx - 1, 10, 1, 3, skin.d, 0.45);
  px(cx - 1, 12, 2, 1, skin.a, 0.65);
  px(cx - 2, 13, 4, 1, skin.a, 0.85);
  px(cx - 1, 13, 2, 1, skin.d, 0.5);

  if (spec.beard && spec.beard !== "none") drawBeard(spec, px, cx, hair);
  if (spec.faceMark && spec.faceMark !== "none") drawFaceMark(spec, px, cx, accentOf(spec));
  drawHair(facing, spec, px, hair);
  drawHumanHeadgear(facing, spec, px, part);
}

/** Distinctive face markings — scars, tattoos, chrome lines, war paint. */
function drawFaceMark(spec: CharSpec, px: Px, cx: number, acc: Tones) {
  const mark = spec.faceMark;
  if (mark === "scar") {
    px(cx - 1, 8, 1, 5, 0xd8a090, 0.85);
    px(cx, 9, 1, 4, 0x8a4a3a, 0.9);
    px(cx + 1, 10, 1, 3, 0xd8a090, 0.7);
  } else if (mark === "tattoo") {
    px(cx - 4, 10, 3, 1, acc.e, 0.9);
    px(cx - 3, 11, 2, 1, acc.d, 0.85);
    px(cx + 2, 9, 2, 2, acc.e, 0.8);
    px(cx + 3, 11, 1, 2, acc.b, 0.75);
  } else if (mark === "chrome") {
    px(cx - 5, 7, 1, 6, acc.e, 0.95);
    px(cx + 4, 8, 1, 5, acc.d, 0.9);
    px(cx - 2, 12, 4, 1, acc.c, 0.8);
    px(cx - 1, 13, 2, 1, acc.e, 0.7);
  } else if (mark === "warpaint") {
    px(cx - 5, 8, 3, 2, acc.e, 0.75);
    px(cx + 2, 8, 3, 2, acc.b, 0.7);
    px(cx - 2, 12, 4, 1, acc.d, 0.85);
    px(cx - 1, 11, 2, 1, acc.e, 0.6);
  }
}

/** Light headgear layered over a human face (cap, hood, helmet rim, etc.). */
function drawHumanHeadgear(facing: Facing, spec: CharSpec, px: Px, part: Part) {
  if (facing === "up") return;
  const t = spec.tones;
  const cx = 16;
  if (spec.head === "cap") {
    px(cx - 7, 1, 14, 3, t.b);
    px(cx - 6, 2, 12, 1, t.c);
    px(cx - 5, 3, 10, 1, t.d, 0.65);
  } else if (spec.head === "hood") {
    part(cx - 8, 1, 16, 5, t.a);
    px(cx - 7, 2, 14, 1, t.b);
    px(cx - 6, 3, 12, 1, t.rim, 0.5);
  } else if (spec.head === "helmet") {
    px(cx - 7, 1, 14, 3, t.c);
    px(cx - 6, 0, 12, 2, t.d, 0.55);
    px(cx - 5, 1, 10, 1, t.e, 0.35);
  } else if (spec.head === "mohawk") {
    px(cx - 1, 0, 2, 5, t.e);
    px(cx - 1, 0, 1, 4, t.d);
  } else if (spec.head === "horns") {
    px(cx - 8, 1, 1, 3, t.d);
    px(cx + 7, 1, 1, 3, t.d);
  } else if (spec.head === "crown") {
    px(cx - 7, 2, 14, 1, t.d);
    for (const ox of [-5, -1, 3]) px(cx + ox, 0, 1, 2, t.e);
  } else if (spec.head === "drone") {
    px(cx + 5, 3, 3, 2, t.b);
    px(cx + 6, 3, 1, 1, t.e);
    px(cx + 7, 2, 2, 1, accentOf(spec).e, 0.9);
  } else if (spec.head === "mask") {
    px(cx - 5, 8, 10, 5, t.a);
    px(cx - 4, 9, 8, 3, t.b);
    px(cx - 3, 10, 2, 1, accentOf(spec).e, 0.95);
    px(cx + 1, 10, 2, 1, accentOf(spec).e, 0.95);
    px(cx - 1, 12, 2, 1, t.o, 0.7);
  } else if (spec.head === "beret") {
    px(cx - 7, 2, 10, 3, t.a);
    px(cx - 6, 1, 8, 2, t.b);
    px(cx - 2, 0, 6, 2, t.c);
    px(cx + 3, 2, 4, 1, t.d, 0.8); // brim tilt
  } else if (spec.head === "spikes") {
    for (const ox of [-5, -2, 1, 4]) px(cx + ox, 0, 1, 3, accentOf(spec).e);
    px(cx - 6, 2, 12, 2, t.b);
  }
}

/** Facial hair on the human face (uses the hair tones). */
function drawBeard(spec: CharSpec, px: Px, cx: number, hair: Tones) {
  if (spec.beard === "stubble") {
    px(cx - 3, 12, 6, 1, hair.a, 0.5);
    px(cx - 2, 11, 4, 1, hair.a, 0.35);
  } else if (spec.beard === "mustache") {
    px(cx - 2, 11, 4, 1, hair.b);
  } else if (spec.beard === "goatee") {
    px(cx - 2, 11, 4, 1, hair.b); // mustache
    px(cx - 1, 12, 2, 2, hair.b); // chin tuft
  } else if (spec.beard === "full") {
    px(cx - 4, 11, 8, 1, hair.b);
    px(cx - 4, 12, 8, 2, hair.b); // jaw
    px(cx - 2, 14, 4, 1, hair.a); // chin
    px(cx - 1, 11, 2, 1, hair.c); // lit upper lip
  }
}

/** Hairstyle drawn on top of the head, in the hair tones. */
function drawHair(facing: Facing, spec: CharSpec, px: Px, hair: Tones) {
  if (!spec.hair || spec.hair === "none") return; // bald
  const cx = 16;
  const back = facing === "up";
  if (spec.hair === "mohawk") {
    px(cx - 1, 0, 2, 5, hair.b); // central crest, shaved sides
    px(cx - 1, 0, 1, 5, hair.c);
    px(cx, 0, 1, 1, hair.d);
    return;
  }
  // base cap over the crown (all other styles)
  px(cx - 6, 1, 12, 1, hair.o);
  px(cx - 5, 1, 10, 3, hair.b);
  px(cx - 5, 2, 10, 1, hair.c);
  px(cx - 6, 4, 1, 4, hair.b);
  px(cx + 5, 4, 1, 4, hair.b); // temples
  if (spec.hair === "long") {
    px(cx - 7, 4, 1, 9, hair.a);
    px(cx + 6, 4, 1, 9, hair.a);
    if (back) px(cx - 6, 4, 12, 9, hair.a);
  } else if (spec.hair === "spiky") {
    for (const sx of [cx - 4, cx - 1, cx + 2]) px(sx, 0, 1, 3, hair.c);
  } else if (spec.hair === "bun") {
    px(cx - 1, 0, 3, 2, hair.b);
    px(cx, 0, 1, 1, hair.c);
  } else if (spec.hair === "afro") {
    px(cx - 7, 0, 14, 5, hair.b);
    px(cx - 6, 0, 1, 5, hair.o);
    px(cx + 6, 0, 1, 5, hair.o);
    px(cx - 5, 0, 10, 1, hair.c);
  } else if (spec.hair === "ponytail") {
    if (back) px(cx - 1, 4, 2, 9, hair.a);
    else px(cx + 5, 4, 2, 7, hair.a);
  } else if (spec.hair === "buzz") {
    px(cx - 5, 1, 10, 3, hair.a, 0.85); // tight + darker — buzzed
  } else if (spec.hair === "braids") {
    px(cx - 7, 4, 2, 9, hair.a);
    px(cx + 5, 4, 2, 9, hair.a); // two strands down the sides
    px(cx - 7, 12, 2, 1, hair.b);
    px(cx + 5, 12, 2, 1, hair.b); // ties
  } else if (spec.hair === "undercut") {
    px(cx - 6, 4, 2, 8, hair.a, 0.55); // shaved sides
    px(cx + 4, 4, 2, 8, hair.a, 0.55);
    px(cx - 3, 0, 6, 4, hair.b); // tall top sweep
    px(cx - 2, 0, 4, 1, hair.c);
    px(cx - 1, 0, 2, 3, hair.d, 0.75);
  } else if (spec.hair === "dreads") {
    for (const ox of [-5, -2, 1, 4]) {
      px(cx + ox, 2, 2, 10, hair.b);
      px(cx + ox, 11, 1, 2, hair.a);
      px(cx + ox, 2, 1, 3, hair.c, 0.7);
    }
    px(cx - 5, 1, 10, 2, hair.b);
  }
  // "short" = just the base cap
}

/** Human head in side profile (facing left) — skin, one eye, hair. */
function drawHumanProfile(spec: CharSpec, px: Px, part: Part) {
  const cx = 15;
  const skin = tonesFromColor(spec.skin ?? 0xe0b48a);
  const hair = tonesFromColor(spec.hairColor ?? 0x2a1d14);
  part(cx - 6, 3, 11, 11, skin.b);
  px(cx - 5, 4, 9, 3, skin.c);
  px(cx - 5, 4, 7, 1, skin.d);
  px(cx + 2, 6, 2, 7, skin.a); // back of skull shadow
  px(cx - 6, 8, 1, 2, skin.c); // nose juts left
  const iris = spec.eyeColor ?? 0x0a0b12;
  px(cx - 4, 8, 2, 2, 0xf0f0f5);
  px(cx - 4, 9, 1, 1, iris);
  px(cx - 4, 8, 1, 1, skin.e);
  px(cx - 4, 11, 2, 1, skin.a, 0.7); // mouth
  px(cx - 5, 7, 2, 1, hair.b); // brow
  if (spec.beard === "stubble") px(cx - 5, 11, 5, 1, hair.a, 0.5);
  else if (spec.beard === "mustache") px(cx - 5, 10, 3, 1, hair.b);
  else if (spec.beard === "goatee") {
    px(cx - 5, 10, 3, 1, hair.b);
    px(cx - 4, 11, 2, 2, hair.b);
  } else if (spec.beard === "full") {
    px(cx - 5, 10, 4, 3, hair.b);
    px(cx - 4, 13, 3, 1, hair.a);
  }
  if (spec.hair && spec.hair !== "none") {
    px(cx - 5, 1, 9, 1, hair.o);
    px(cx - 5, 1, 9, 3, hair.b);
    px(cx - 5, 2, 9, 1, hair.c);
    px(cx + 3, 3, 1, 6, hair.a);
    if (spec.hair === "long" || spec.hair === "ponytail") px(cx + 3, 4, 2, 9, hair.a);
    else if (spec.hair === "spiky") for (const sx of [cx - 3, cx, cx + 2]) px(sx, 0, 1, 2, hair.c);
    else if (spec.hair === "afro") part(cx - 6, 0, 11, 5, hair.b);
    else if (spec.hair === "bun") px(cx + 3, 1, 2, 2, hair.b);
    else if (spec.hair === "undercut") {
      px(cx - 5, 0, 6, 4, hair.b);
      px(cx + 2, 4, 1, 6, hair.a, 0.5);
    } else if (spec.hair === "dreads") {
      for (const ox of [-4, -1, 2]) px(cx + ox, 2, 2, 9, hair.b);
    }
  }
  if (spec.faceMark && spec.faceMark !== "none") {
    const acc = accentOf(spec);
    if (spec.faceMark === "scar") px(cx - 3, 9, 1, 4, 0x8a4a3a, 0.9);
    else if (spec.faceMark === "tattoo") px(cx - 4, 10, 3, 1, acc.e, 0.85);
    else if (spec.faceMark === "chrome") px(cx - 5, 8, 1, 4, acc.e, 0.9);
    else if (spec.faceMark === "warpaint") px(cx - 5, 9, 3, 2, acc.e, 0.7);
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

  // helmet / head dome (12 wide) — domed crown, cheek plates, jaw guard
  part(cx - 6, 3, 12, 11, t.b);
  px(cx - 5, 4, 10, 2, t.c); // lit crown
  px(cx - 4, 4, 7, 1, t.d); // crown highlight
  px(cx - 5, 4, 1, 1, t.e, 0.5); // crown spec
  px(cx + 3, 6, 2, 7, t.a); // right side shadow
  px(cx + 4, 5, 1, 8, t.o, 0.5); // right edge core-shadow
  px(cx - 5, 6, 1, 7, t.rim, 0.7); // cool rim on the left
  px(cx - 6, 6, 1, 5, t.rim, 0.3); // outer rim halo
  px(cx - 5, 11, 2, 2, t.b); // left cheek plate
  px(cx + 3, 11, 2, 2, t.a); // right cheek plate (shadowed)
  px(cx - 3, 13, 6, 1, t.o, 0.6); // jaw guard shadow

  // crest ridge
  px(cx - 1, 2, 3, 2, t.c);
  px(cx, 2, 1, 1, t.d);
  px(cx - 1, 2, 1, 2, t.rim, 0.5); // crest rim-light

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
  } else if (spec.head === "mask") {
    px(cx - 5, 8, 10, 5, t.a);
    px(cx - 4, 9, 8, 3, t.b);
    px(cx - 3, 10, 2, 1, accentOf(spec).e);
    px(cx + 1, 10, 2, 1, accentOf(spec).e);
  } else if (spec.head === "beret") {
    px(cx - 7, 2, 12, 3, t.a);
    px(cx - 2, 0, 7, 2, t.c);
    px(cx + 4, 2, 3, 1, t.d, 0.75);
  } else if (spec.head === "spikes") {
    for (const ox of [-5, -2, 1, 4]) px(cx + ox, 0, 1, 3, accentOf(spec).e);
    px(cx - 6, 2, 12, 2, t.b);
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
    px(cx - 5, 7, 10, 1, t.a); // brow shadow over the lenses
    px(cx - 4, 8, 3, 2, t.e); // left lens
    px(cx + 1, 8, 3, 2, t.e); // right lens
    px(cx - 4, 9, 3, 1, t.e, 0.5); // left lens falloff
    px(cx + 1, 9, 3, 1, t.e, 0.5); // right lens falloff
    px(cx - 4, 8, 1, 1, 0xffffff, 0.85);
    px(cx + 1, 8, 1, 1, 0xffffff, 0.85); // hot specular specks
    px(cx, 8, 1, 2, t.o); // nose bridge between lenses
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
    px(x, 7, w, 1, t.o); // top brow shadow
    px(x + 1, 8, w - 2, 2, t.e); // glowing band
    px(x + 1, 9, w - 2, 1, t.e, 0.5); // lower band falloff (vertical gradient)
    px(x + 1, 8, 3, 1, 0xffffff, 0.55); // hot reflection streak
    px(x + 2, 8, 1, 1, 0xffffff, 0.9); // hotspot
    px(x + w - 3, 9, 2, 1, t.a, 0.6); // right shadow corner
    px(x + 1, 10, w - 2, 1, t.e, 0.28); // under-glow bleed
  }
}

/** Side profile (facing left); mirrored in-bake for right. */
function drawProfile(
  spec: CharSpec,
  px: (x: number, y: number, w: number, h: number, c: number, a?: number) => void,
  part: (x: number, y: number, w: number, h: number, fill: number) => void,
  bulk: number,
  step = 0,
) {
  const t = spec.tones;
  const cx = 15;
  const sw = walkSwing(step); // front/back legs scissor along the walk axis

  // cape trails behind (to the right, since we face left)
  if (spec.cloak === "cape") {
    part(cx + 2, 13, 5 + Math.max(0, bulk), 16, t.a);
    px(cx + 3, 14, 3, 13, t.b);
    px(cx + 2, 14, 1, 14, t.rim, 0.5);
  }

  // legs — front + trailing (scissor along the facing axis)
  part(cx - 1 - sw, 23, 4, 6, t.b);
  part(cx + 3 + sw, 23, 4, 6, t.a); // trailing leg, shadowed
  px(cx - sw, 24, 1, 4, t.c);

  // torso (narrower in profile), facing left
  const tw = 9 + Math.max(0, bulk) - (spec.sex === "f" ? 1 : 0);
  part(cx - 3, 13, tw, 4, t.b); // shoulder
  px(cx - 3, 14, tw, 1, t.c);
  part(cx - 3, 16, tw, 8, t.b);
  px(cx - 2, 17, 4, 6, t.c); // front-lit chest
  if (spec.sex === "f") px(cx - 4, 18, 1, 2, t.d, 0.6); // bust
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

  // leading arm — swings with the trailing leg
  part(cx - 4 + sw, 16, 3, 8, t.b);
  px(cx - 3 + sw, 17, 1, 6, t.c);

  // antennae (cyber heads only)
  if (spec.antennae && spec.skin == null) {
    px(cx - 4, 1, 1, 4, t.o);
    px(cx - 4, 1, 1, 1, t.e);
  }

  // human face replaces the cyber visored head
  if (spec.skin != null) {
    drawHumanProfile(spec, px, part);
    return;
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
  } else if (spec.head === "mask") {
    px(cx - 6, 8, 7, 4, t.a);
    px(cx - 5, 9, 5, 2, accentOf(spec).e, 0.85);
  } else if (spec.head === "beret") {
    px(cx - 6, 2, 8, 2, t.c);
    px(cx - 1, 1, 5, 2, t.b);
  } else if (spec.head === "spikes") {
    px(cx - 4, 0, 1, 3, accentOf(spec).e);
    px(cx, 0, 1, 3, accentOf(spec).e);
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

// METROPHAGE — code-authored NON-HUMANOID enemies, drawn parametrically at 32×32 to the
// same contract as charart.ts: top-down 3/4 view, facing-major frames [down, left, right,
// up] with `right` mirrored from `left`, GRAY tones so the scene's setTint() recolors them.
//
// WHY: every ENEMY_ARCHES entry rendered as the same tinted cop sheet, so a 24hp WASP and
// a 170hp ENFORCER had identical silhouettes — threat was readable only by hue, which is
// no help at all to a colourblind player. charart's CharSpec is strictly humanoid (build /
// head / visor / hair / legGear), so it cannot express these. Each body plan below exists
// to own a distinct SILHOUETTE:
//
//   drone   — wide rotor X, small pod, floats high above its shadow
//   beast   — low horizontal quadruped, four legs, head slung forward
//   spectre — vertical teardrop, no legs, hovers on a wisp
//
// Read them at 32px, not zoomed: shape first, detail second. Anything finer than ~2px
// disappears at game scale, so these are built from chunky blocks.

import { CHAR, GRAY, walkSwing, type Facing } from "./charart";

type Tones = typeof GRAY;
type Px = (x: number, y: number, w: number, h: number, c: number, a?: number) => void;

const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
const FACINGS: Facing[] = ["down", "left", "right", "up"];
const CX = 16;

/** Body plans that are not humanoid. Humanoid archetypes keep the cop sheet. */
export type EnemyBody = "drone" | "beast" | "spectre";

function pxOf(ctx: CanvasRenderingContext2D): Px {
  return (x, y, w, h, c, a = 1) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = hex(c);
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  };
}

/** Outline a block then inset-fill it — the 1px silhouette edge charart uses. */
function partOf(px: Px, t: Tones) {
  return (x: number, y: number, w: number, h: number, fill: number) => {
    px(x, y, w, h, t.o);
    px(x + 1, y + 1, w - 2, h - 2, fill);
  };
}

/** Ground contact shadow. `lift` shrinks/fades it — a hovering body reads as airborne. */
function shadow(px: Px, t: Tones, lift = 0) {
  const w = 14 - lift * 4;
  px(CX - w / 2, 29, w, 2, 0x000000, 0.35 - lift * 0.1);
  px(CX - w / 2 + 2, 28, w - 4, 1, 0x000000, 0.18 - lift * 0.06);
  px(CX - 4, 30, 8, 1, t.e, 0.18 - lift * 0.06);
}

// ── DRONE ────────────────────────────────────────────────────────────────────
// Quadcopter: four rotor discs in a wide X around a small pod. Hovers high, so the
// shadow stays small and detached. The "walk" cycle is a rotor phase + hover bob.
function drawDrone(ctx: CanvasRenderingContext2D, facing: Facing, step: number) {
  const t = GRAY;
  const px = pxOf(ctx);
  const part = partOf(px, t);
  const sw = walkSwing(step);
  const bob = sw > 0 ? -1 : sw < 0 ? 1 : 0; // hover wobble
  shadow(px, t, 2);

  const y = 8 + bob; // pod top — well above the shadow: it flies
  const back = facing === "up";

  // rotor booms
  px(7, y + 2, 18, 1, t.a);
  px(7, y + 9, 18, 1, t.a);
  // Rotor discs — an ellipse, not a bar: the blurred pair alternates each step so the
  // props read as spinning without a real animation.
  const spin = step % 2 === 0;
  const disc = (rx: number, ry: number, blur: boolean) => {
    px(rx + 1, ry, 7, 1, t.o);
    px(rx, ry + 1, 9, 1, blur ? t.c : t.d, blur ? 0.5 : 0.95);
    px(rx + 1, ry + 2, 7, 1, t.o, 0.8);
    px(rx + 3, ry + 1, 3, 1, t.a); // hub
  };
  disc(0, y + 1, spin);
  disc(23, y + 1, !spin);
  disc(0, y + 8, !spin);
  disc(23, y + 8, spin);

  // Pod — chamfered, so the body is a hex-ish blob rather than a crate.
  px(12, y + 1, 8, 1, t.o);
  part(11, y + 2, 10, 9, t.b);
  px(12, y + 11, 8, 1, t.o);
  px(12, y + 3, 3, 7, t.c, 0.9); // lit flank
  px(18, y + 4, 2, 6, t.a); // shaded flank

  if (back) {
    px(13, y + 3, 6, 2, t.a); // rear vents
    px(14, y + 6, 4, 1, t.e, 0.3); // tail light
  } else if (facing === "down") {
    px(13, y + 8, 6, 3, t.e); // sensor eye toward viewer
    px(12, y + 4, 8, 1, t.d, 0.6);
  } else {
    // profile: eye leads
    px(11, y + 6, 3, 3, t.e);
    px(15, y + 3, 5, 1, t.d, 0.6);
  }
}

// ── BEAST ────────────────────────────────────────────────────────────────────
// Quadruped rusher: low, horizontal, head slung forward. Nothing else in the roster
// is wider than it is tall, which is the whole point.
function drawBeast(ctx: CanvasRenderingContext2D, facing: Facing, step: number) {
  const t = GRAY;
  const px = pxOf(ctx);
  const part = partOf(px, t);
  const sw = walkSwing(step);
  shadow(px, t, 0);

  const leg = (x: number, y: number, phase: number) => {
    px(x, y, 3, 5 + phase, t.o);
    px(x + 1, y, 1, 4 + phase, t.a);
  };

  if (facing === "left") {
    // profile — the readable one: head left, haunches right, tail up
    part(4, 15, 9, 8, t.c); // head
    px(5, 18, 3, 2, t.e); // eye
    px(4, 21, 4, 1, t.o); // muzzle line
    part(11, 13, 15, 10, t.b); // body
    px(13, 15, 9, 3, t.c, 0.8); // lit back
    px(20, 11, 5, 3, t.a); // shoulder hump
    // legs — diagonal gait
    leg(12, 22, sw > 0 ? 1 : 0);
    leg(16, 22, sw < 0 ? 1 : 0);
    leg(21, 22, sw > 0 ? 0 : 1);
    leg(24, 22, sw < 0 ? 0 : 1);
    px(26, 12, 4, 2, t.a); // tail
    px(28, 9, 2, 3, t.a, 0.8);
    return;
  }

  const back = facing === "up";
  // head-on / rear: body recedes up the cell
  part(10, 10, 12, 13, t.b); // body
  px(12, 12, 4, 9, t.c, 0.7); // lit flank
  if (back) {
    px(13, 12, 6, 4, t.a); // haunches
    px(15, 5, 2, 6, t.a); // tail raised toward viewer
    px(14, 4, 4, 2, t.a, 0.8);
  } else {
    part(12, 19, 8, 7, t.c); // head toward viewer
    px(13, 22, 2, 2, t.e); // eyes
    px(17, 22, 2, 2, t.e);
    px(14, 25, 4, 1, t.o); // muzzle
    px(11, 8, 3, 3, t.a); // ears
    px(18, 8, 3, 3, t.a);
  }
  // four legs, alternating
  leg(9, 23, sw > 0 ? 1 : 0);
  leg(20, 23, sw < 0 ? 1 : 0);
  leg(11, 21, sw < 0 ? 1 : 0);
  leg(18, 21, sw > 0 ? 1 : 0);
}

// ── SPECTRE ──────────────────────────────────────────────────────────────────
// Hooded shroud tapering to a wisp — no legs, no ground contact. Reads as the only
// vertical teardrop in the roster.
function drawSpectre(ctx: CanvasRenderingContext2D, facing: Facing, step: number) {
  const t = GRAY;
  const px = pxOf(ctx);
  const part = partOf(px, t);
  const sw = walkSwing(step);
  const bob = sw > 0 ? -1 : sw < 0 ? 1 : 0;
  shadow(px, t, 2);

  const y = 4 + bob;
  const back = facing === "up";

  // Cowl — narrow at the crown, flaring to the shoulders of the shroud. Kept under
  // 10px wide: a square head on a wide body reads as a humanoid robot, not a ghost.
  px(13, y, 6, 1, t.o);
  part(12, y + 1, 8, 4, t.b);
  part(11, y + 4, 10, 7, t.b);
  px(12, y + 5, 2, 5, t.c, 0.75); // lit cowl edge

  if (!back) {
    part(13, y + 5, 6, 5, t.d); // mask
    if (facing === "down") {
      px(14, y + 7, 1, 2, t.o); // eyes
      px(17, y + 7, 1, 2, t.o);
    } else {
      px(14, y + 7, 2, 2, t.o); // profile: one eye
    }
  } else {
    px(13, y + 5, 6, 5, t.a); // back of the cowl
  }

  // Shroud — a tapering banded cone. No shoulders, no arms: the silhouette narrows
  // continuously from cowl to wisp so it reads as one falling drape.
  const cone = (row: number, halfW: number, tone: number, a = 1) =>
    px(CX - halfW, y + 11 + row, halfW * 2, 1, tone, a);
  cone(0, 5, t.o);
  for (let r = 1; r < 8; r++) {
    const hw = 5 - Math.floor(r / 2);
    px(CX - hw, y + 11 + r, hw * 2, 1, r % 3 === 0 ? t.a : t.b);
    px(CX - hw, y + 11 + r, 1, 1, t.c, 0.7); // lit left edge
  }
  px(CX - 4, y + 13, 8, 1, t.e, 0.22); // neon band

  // Wisp — drifts with the cycle so the float reads without a walk. Kept clear of the
  // contact row: a tail that reaches the ground reads as standing, not hovering.
  px(CX - 1 + sw, y + 18, 3, 3, t.a);
  px(CX - 1 + sw * 2, y + 21, 2, 1, t.a, 0.55);
  px(CX + sw * 2, y + 22, 1, 1, t.a, 0.3);
}

const BODY_DRAW: Record<EnemyBody, (c: CanvasRenderingContext2D, f: Facing, s: number) => void> = {
  drone: drawDrone,
  beast: drawBeast,
  spectre: drawSpectre,
};

/**
 * Draw one frame of a non-humanoid enemy. Mirrors charart.drawCharacter's contract:
 * frame → facing via FACINGS, `right` is a mirrored `left`.
 */
export function drawEnemyBody(
  ctx: CanvasRenderingContext2D,
  frame: number,
  body: EnemyBody,
  step = 0,
) {
  const facing = FACINGS[frame] ?? "down";
  const draw = BODY_DRAW[body];
  if (facing === "right") {
    ctx.save();
    ctx.translate(CHAR, 0);
    ctx.scale(-1, 1);
    draw(ctx, "left", step);
    ctx.restore();
    return;
  }
  draw(ctx, facing, step);
}

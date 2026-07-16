import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";
import { TILE, DISTRICT_SCALE } from "../config";
import type { Rect } from "../game/districts";
import {
  LANDMARK_KINDS,
  type BuildingKind,
  type CityBuilding,
} from "../world/city";
import { districtBuildingKind } from "../game/districtVenues";
import { selectBuildingSprite, type SpriteOpts } from "./buildingSprites";

/** Per-kind exterior identity — roof accent, sign colour, and a simple façade glyph. */
const KIND_STYLE: Record<
  BuildingKind,
  { accent: number; sign: number; glyph: "cross" | "metro" | "arena" | "spire" | "shop" | "bar" | "home" | "den" | "guild" | "none" }
> = {
  bar: { accent: 0xff2bd6, sign: 0xff2bd6, glyph: "bar" },
  noodle: { accent: 0xffb13c, sign: 0xff2bd6, glyph: "bar" },
  ripperdoc: { accent: 0x8dfff0, sign: 0x39ff88, glyph: "cross" },
  pawn: { accent: 0xf7ff3c, sign: 0xffb13c, glyph: "shop" },
  arcade: { accent: 0xb06bff, sign: 0xff2bd6, glyph: "den" },
  garage: { accent: 0x8bff6a, sign: 0xffb13c, glyph: "guild" },
  radio: { accent: 0x29e7ff, sign: 0xff2bd6, glyph: "spire" },
  shop: { accent: 0xffb13c, sign: 0xf7ff3c, glyph: "shop" },
  clinic: { accent: 0x39ff88, sign: 0x39ff88, glyph: "cross" },
  guild: { accent: 0x29e7ff, sign: 0x00e5ff, glyph: "guild" },
  hospital: { accent: 0x39ff88, sign: 0x39ff88, glyph: "cross" },
  hotel: { accent: 0x6b9bff, sign: 0x9ec8ff, glyph: "home" },
  subway: { accent: 0x29e7ff, sign: 0x00e5ff, glyph: "metro" },
  stadium: { accent: 0xff3b6b, sign: 0xff3b6b, glyph: "arena" },
  citycenter: { accent: 0xf7ff3c, sign: 0xf7ff3c, glyph: "spire" },
  home: { accent: 0xff8a5c, sign: 0xffb86a, glyph: "home" },
  den: { accent: 0xb06bff, sign: 0x9a5cff, glyph: "den" },
};

function glow(scene: Phaser.Scene, x: number, y: number, col: number, scale: number, alpha: number, depth: number) {
  return scene.add
    .image(x, y, GLOW_KEY)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(col)
    .setDepth(depth)
    .setScale(scale)
    .setAlpha(alpha);
}

function drawGlyph(g: Phaser.GameObjects.Graphics, kind: (typeof KIND_STYLE)[BuildingKind]["glyph"], x: number, y: number, col: number) {
  switch (kind) {
    case "cross":
      g.fillStyle(col, 0.95).fillRect(x - 1, y - 5, 3, 10).fillRect(x - 4, y - 2, 9, 3);
      break;
    case "metro":
      g.fillStyle(col, 0.9).fillTriangle(x, y - 6, x - 5, y + 2, x + 5, y + 2);
      g.fillStyle(0x0a0e18, 0.9).fillRect(x - 1, y - 2, 2, 4);
      break;
    case "arena":
      g.lineStyle(2, col, 0.85).strokeCircle(x, y, 6);
      g.lineStyle(1, col, 0.6).strokeCircle(x, y, 3);
      break;
    case "spire":
      g.fillStyle(col, 0.9).fillTriangle(x, y - 7, x - 4, y + 3, x + 4, y + 3);
      g.fillStyle(0xffffff, 0.5).fillRect(x - 1, y - 4, 2, 5);
      break;
    case "shop":
      for (let i = 0; i < 4; i++) g.fillStyle(i % 2 === 0 ? col : 0x1a1020, 0.9).fillRect(x - 7 + i * 4, y - 3, 3, 5);
      break;
    case "bar":
      g.fillStyle(col, 0.9).fillRect(x - 6, y - 2, 12, 3);
      g.fillStyle(0xffffff, 0.7).fillCircle(x - 3, y - 5, 2).fillCircle(x + 3, y - 5, 2);
      break;
    case "home":
      g.fillStyle(col, 0.85).fillTriangle(x, y - 6, x - 6, y + 1, x + 6, y + 1);
      g.fillStyle(0x1a1020, 0.9).fillRect(x - 3, y - 1, 6, 5);
      break;
    case "den":
      g.fillStyle(col, 0.35).fillRect(x - 7, y - 4, 14, 8);
      g.lineStyle(1, col, 0.8).strokeRect(x - 7, y - 4, 14, 8);
      break;
    case "guild":
      g.fillStyle(col, 0.9).fillRect(x - 1, y - 6, 2, 12);
      g.fillStyle(col, 0.7).fillRect(x - 5, y - 6, 10, 2);
      break;
    default:
      break;
  }
}

function paintFacade(
  scene: Phaser.Scene,
  rect: Rect,
  door: [number, number] | undefined,
  accent: number,
  signCol: number,
  glyph: (typeof KIND_STYLE)[BuildingKind]["glyph"],
  depth: number,
  landmark = false,
) {
  const g = scene.add.graphics().setDepth(depth);
  const X1 = rect.x1 * TILE;
  const Y1 = rect.y1 * TILE;
  const X2 = (rect.x2 + 1) * TILE;
  const Y2 = (rect.y2 + 1) * TILE;
  const w = X2 - X1;
  const h = Y2 - Y1;

  // roof crown — kind-coloured band along the north edge
  g.fillStyle(accent, landmark ? 0.55 : 0.38).fillRect(X1, Y1, w, 3);
  g.fillStyle(accent, landmark ? 0.85 : 0.65).fillRect(X1, Y1, w, 1);

  // west face trim (visible when approaching from the left)
  g.fillStyle(accent, 0.22).fillRect(X1, Y1 + 3, 2, h - 3);

  if (landmark) {
    glow(scene, X1 + w * 0.5, Y1 + 4, accent, 1.2, 0.28, depth - 0.1);
  }

  if (!door) return;

  const [dx, dy] = door;
  const cx = dx * TILE + TILE / 2;
  const cy = dy * TILE;

  // storefront sign panel above the door
  const panelW = landmark ? 56 : 40;
  const panelH = landmark ? 14 : 10;
  const px = cx - panelW / 2;
  const py = cy - panelH - 6;
  g.fillStyle(0x080a14, 0.82).fillRect(px, py, panelW, panelH);
  g.lineStyle(1, signCol, 0.9).strokeRect(px, py, panelW, panelH);
  g.fillStyle(signCol, 0.75).fillRect(px + 2, py + 2, panelW - 4, 2);
  drawGlyph(g, glyph, cx, py + panelH / 2 + 1, signCol);

  // neon door frame
  g.lineStyle(2, signCol, 0.75).lineBetween(cx - 10, cy - 2, cx - 10, cy + TILE - 2);
  g.lineStyle(2, signCol, 0.75).lineBetween(cx + 10, cy - 2, cx + 10, cy + TILE - 2);
  g.fillStyle(signCol, 0.5).fillRect(cx - 12, cy + TILE - 4, 24, 2);

  glow(scene, cx, cy + TILE / 2, signCol, landmark ? 0.95 : 0.7, landmark ? 0.22 : 0.14, depth - 0.05);
}

/** Neon accent for a building kind (shared by façade + rooftop passes). */
export function buildingExteriorAccent(kind: BuildingKind): number {
  return KIND_STYLE[kind].accent;
}

/**
 * Choose the exterior sprite for a footprint. Tables + precedence live in
 * buildingSprites.ts (Phaser-free, unit-tested); this only adapts the Phaser scene.
 */
function pickBuildingSprite(
  scene: Phaser.Scene,
  kind: BuildingKind,
  opts?: SpriteOpts,
): string | undefined {
  return selectBuildingSprite((k) => scene.textures.exists(k), kind, opts);
}

/**
 * Footprint large enough for a readable full HF sprite (not a 1-tile shed).
 * Tile units (unscaled design tiles for districts; world tiles for city).
 */
function isPaintableBuilding(rect: Rect, scale = 1): boolean {
  const tw = (rect.x2 - rect.x1 + 1) * scale;
  const th = (rect.y2 - rect.y1 + 1) * scale;
  // Compact hub blocks are often 4×3–6×5 — still show HF art (was ≥24 tile² gate
  // which skipped most city-center landmarks after the hub shrink).
  return tw >= 3 && th >= 3 && tw * th >= 12;
}

/** Opaque underlay + full-bleed HF sprite covering the entire footprint. */
function placeFullBuildingArt(
  scene: Phaser.Scene,
  X1: number,
  Y1: number,
  w: number,
  h: number,
  spriteKey: string,
  depth: number,
  accent: number,
): void {
  // Structural steel pad so tilemap wall cells never peek through transparent PNG
  // edges. This used to be opaque near-black, turning every transparent silhouette
  // margin into a black rectangle when art did not fill its footprint.
  const pad = scene.add.graphics().setDepth(depth);
  pad.fillStyle(0x1b2534, 1).fillRect(X1, Y1, w, h);
  pad.fillStyle(accent, 0.16).fillRect(X1 + 3, Y1 + 3, Math.max(0, w - 6), Math.max(0, h - 6));
  pad.fillStyle(0x344256, 0.72).fillRect(X1, Y1, w, 3);
  pad.fillStyle(accent, 0.48).fillRect(X1, Y1, w, 1);
  const img = scene.add
    .image(X1 + w / 2, Y1 + h / 2, spriteKey)
    .setDisplaySize(w, h)
    .setDepth(depth + 0.05)
    .setAlpha(1);
  // Environment sources are already enhanced to their display size. LINEAR filtering
  // softened them a second time (especially under camera zoom), making hub buildings
  // look blurred despite the larger PNGs. Keep hard detail at the pixel-art renderer's
  // native NEAREST policy.
  try {
    scene.textures.get(spriteKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
  } catch {
    /* ignore */
  }
  void img;
}

/** Orbital Relay's source plates are intentionally dark rooftop hardware. At gameplay
 * scale their detail can collapse into an undecorated slab, so reinforce the authored
 * uplink language with sparse vector panels that remain legible under fog and zoom. */
function paintRelayIdentity(
  scene: Phaser.Scene,
  X1: number,
  Y1: number,
  X2: number,
  Y2: number,
  depth: number,
  salt: number,
): void {
  const g = scene.add.graphics().setDepth(depth + 0.11);
  const w = X2 - X1;
  const h = Y2 - Y1;
  const cyan = 0x61e7ff;
  const blue = 0x6b9bff;
  g.lineStyle(2, cyan, 0.72).strokeRect(X1 + 5, Y1 + 5, Math.max(2, w - 10), Math.max(2, h - 10));
  g.lineStyle(1, blue, 0.5).strokeRect(X1 + 10, Y1 + 10, Math.max(2, w - 20), Math.max(2, h - 20));

  // Communications panel bays along the upper and lower faces.
  const bays = Math.max(2, Math.min(6, Math.floor(w / 80)));
  const gap = w / (bays + 1);
  for (let i = 1; i <= bays; i++) {
    const px = X1 + gap * i;
    const lit = (i + salt) % 3 !== 0;
    g.fillStyle(lit ? cyan : blue, lit ? 0.7 : 0.32).fillRect(px - 10, Y1 + 14, 20, 5);
    g.fillStyle(0x091522, 0.88).fillRect(px - 7, Y1 + 16, 14, 1);
    g.fillStyle(lit ? blue : cyan, 0.42).fillRect(px - 8, Y2 - 19, 16, 4);
  }

  // Concentric uplink dish/radar mark. On narrow gate pylons it becomes a compact
  // antenna target rather than squeezing a whole building painting into a blank bar.
  const cx = X1 + w * 0.5;
  const cy = Y1 + h * 0.5;
  const r = Math.max(7, Math.min(28, Math.min(w, h) * 0.18));
  g.lineStyle(2, cyan, 0.75).strokeCircle(cx, cy, r);
  g.lineStyle(1, blue, 0.6).strokeCircle(cx, cy, r * 0.55);
  g.lineStyle(1, cyan, 0.55).lineBetween(cx - r, cy, cx + r, cy);
  g.lineStyle(1, cyan, 0.55).lineBetween(cx, cy - r, cx, cy + r);
  g.fillStyle(0xeafcff, 0.9).fillCircle(cx, cy, 2);
}

/** Readable surface detail for the buried-vault kit. The art deliberately uses deep,
 * organic shadows; these service seams keep its structures legible from the combat
 * camera without turning them into bright generic city blocks. */
function paintUndercityIdentity(
  scene: Phaser.Scene,
  X1: number,
  Y1: number,
  X2: number,
  Y2: number,
  depth: number,
  salt: number,
): void {
  const g = scene.add.graphics().setDepth(depth + 0.11);
  const w = X2 - X1;
  const h = Y2 - Y1;
  const cyan = 0x4fe8e2;
  const hazard = 0x9dff3c;
  g.lineStyle(2, cyan, 0.6).strokeRect(X1 + 6, Y1 + 6, Math.max(2, w - 12), Math.max(2, h - 12));
  // Uneven containment seams make a long rectangular footprint read as a vault wall.
  const seams = Math.max(2, Math.min(6, Math.floor(w / 84)));
  for (let i = 1; i <= seams; i++) {
    const x = X1 + (w * i) / (seams + 1);
    const lit = (salt + i) % 3 !== 0;
    g.lineStyle(2, lit ? cyan : 0x273d48, lit ? 0.68 : 0.7).lineBetween(x, Y1 + 14, x, Y2 - 14);
    if (lit) g.fillStyle(cyan, 0.72).fillRect(x - 7, Y1 + 18, 14, 5);
  }
  const bayY = Y1 + h * 0.57;
  g.fillStyle(0x0b2025, 0.78).fillRect(X1 + 14, bayY - 11, Math.max(4, w - 28), 22);
  g.lineStyle(1, hazard, 0.58).strokeRect(X1 + 14, bayY - 11, Math.max(4, w - 28), 22);
  for (let x = X1 + 26; x < X2 - 16; x += 28) {
    g.fillStyle((x + salt) % 2 === 0 ? cyan : hazard, 0.48).fillRect(x, bayY - 3, 13, 6);
  }
}

/** Thin neon door frame so enterable HF buildings still read as venues. */
function paintDoorFrameOnly(
  scene: Phaser.Scene,
  door: [number, number],
  signCol: number,
  depth: number,
  landmark: boolean,
): void {
  const g = scene.add.graphics().setDepth(depth + 0.1);
  const cx = door[0] * TILE + TILE / 2;
  const cy = door[1] * TILE;
  g.lineStyle(2, signCol, 0.8).lineBetween(cx - 10, cy - 2, cx - 10, cy + TILE - 2);
  g.lineStyle(2, signCol, 0.8).lineBetween(cx + 10, cy - 2, cx + 10, cy + TILE - 2);
  g.fillStyle(signCol, 0.55).fillRect(cx - 12, cy + TILE - 4, 24, 2);
  glow(scene, cx, cy + TILE / 2, signCol, landmark ? 0.95 : 0.7, landmark ? 0.22 : 0.14, depth + 0.08);
}

/**
 * Distinct exteriors for city-hub buildings (kind + landmark aware).
 * Returns tile rects fully replaced by Higgsfield art (caller should skip roof
 * parallax caps on these so dark slabs don't cover the painted buildings).
 */
export function paintCityBuildingFacades(
  scene: Phaser.Scene,
  buildings: CityBuilding[],
  depth = 4.0,
  opts?: { infected?: boolean },
): Rect[] {
  const hfRects: Rect[] = [];
  for (let bi = 0; bi < buildings.length; bi++) {
    const b = buildings[bi];
    const style = KIND_STYLE[b.kind];
    const landmark = LANDMARK_KINDS.includes(b.kind);
    const spriteKey = pickBuildingSprite(scene, b.kind, {
      districtId: b.env,
      infected: opts?.infected,
      // Hash footprint so two bars on the hub don't share the same multivariant.
      variantSalt: bi * 17 + b.rect.x1 * 3 + b.rect.y1 * 5,
    });
    const X1 = b.rect.x1 * TILE;
    const Y1 = b.rect.y1 * TILE;
    const w = (b.rect.x2 + 1) * TILE - X1;
    const h = (b.rect.y2 + 1) * TILE - Y1;
    // Any paintable footprint with HF art: full replacement (no dark roof slab over it).
    const fullReplace = !!spriteKey && (landmark || isPaintableBuilding(b.rect));
    if (fullReplace && spriteKey) {
      placeFullBuildingArt(scene, X1, Y1, w, h, spriteKey, depth, style.accent);
      if (b.door) paintDoorFrameOnly(scene, b.door, style.sign, depth, landmark);
      if (landmark) glow(scene, X1 + w * 0.5, Y1 + 4, style.accent, 1.2, 0.28, depth + 0.12);
      hfRects.push(b.rect);
      continue;
    }
    paintFacade(scene, b.rect, b.door, style.accent, style.sign, style.glyph, depth, landmark);
    // Tiny sheds: procedural + soft HF overlay when available.
    if (spriteKey) {
      scene.add
        .image(X1 + w / 2, Y1 + h / 2, spriteKey)
        .setDisplaySize(w * 0.96, h * 0.96)
        .setDepth(depth + 0.05)
        .setAlpha(0.95);
      hfRects.push(b.rect);
    }
  }
  return hfRects;
}

/**
 * Combat districts — enterable venues use unique kind art; scenery blocks use only the
 * district kit (no second shop/bar façade).
 *
 * ⚠ `buildings` are 1/3-res DESIGN rects (buildGrid scales walls ×DISTRICT_SCALE).
 * Doors are NOT drawn here — OnlineScene draws the enterable doorway at the scaled
 * south face.
 *
 * Returns WORLD-tile rects fully covered by HF art (for roof-parallax exclusion).
 */
export function paintDistrictBuildingFacades(
  scene: Phaser.Scene,
  buildings: Rect[],
  _zoneAccent: number,
  depth = 4.0,
  opts?: { districtId?: string; infected?: boolean },
): Rect[] {
  const S = DISTRICT_SCALE;
  const g = scene.add.graphics().setDepth(depth);
  const hfRects: Rect[] = [];
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const venueKind = districtBuildingKind(i);
    // Scenery (no door): always district kit. Venues: one unique kind art each.
    const kind: BuildingKind = venueKind ?? "home";
    const { accent, sign } = KIND_STYLE[kind];
    const landmark = venueKind !== null; // only enterable venues read as landmarks
    // scaleRect is inclusive x1*S..x2*S — match fill() footprint exactly.
    const X1 = b.x1 * S * TILE;
    const Y1 = b.y1 * S * TILE;
    const X2 = (b.x2 * S + 1) * TILE;
    const Y2 = (b.y2 * S + 1) * TILE;
    const w = X2 - X1;
    const h = Y2 - Y1;
    const worldRect: Rect = { x1: b.x1 * S, y1: b.y1 * S, x2: b.x2 * S, y2: b.y2 * S };

    const spriteKey = pickBuildingSprite(scene, kind, {
      districtId: opts?.districtId,
      infected: opts?.infected || (opts?.districtId === "undercity" && i % 3 === 0),
      // Scenery = district kit only; venues get kind-specific art.
      preferDistrictKit: venueKind === null,
      variantSalt: i * 19 + (b.x1 + b.y1) * 7 + (opts?.districtId?.length ?? 0),
    });
    const fullReplace = !!spriteKey && (landmark || isPaintableBuilding(b, S) || venueKind === null);

    if (fullReplace && spriteKey) {
      placeFullBuildingArt(scene, X1, Y1, w, h, spriteKey, depth, accent);
      if (opts?.districtId === "relay") paintRelayIdentity(scene, X1, Y1, X2, Y2, depth, i);
      if (opts?.districtId === "undercity") paintUndercityIdentity(scene, X1, Y1, X2, Y2, depth, i);
      if (landmark) glow(scene, X1 + w * 0.5, Y1 + 6, accent, 2.4, 0.22, depth + 0.12);
      hfRects.push(worldRect);
      continue;
    }

    // Small / no-art fallback: a complete steel structure, not a lightly tinted tile
    // rectangle. If any generated file fails, the footprint must still read as a
    // building with mass, façade bays, windows and a roof crown.
    g.fillStyle(0x202b38, 0.98).fillRect(X1, Y1, w, h);
    g.fillStyle(0x111923, 0.9).fillRect(X1 + 5, Y1 + 9, Math.max(0, w - 10), Math.max(0, h - 14));
    const bayW = Math.max(18, Math.min(36, Math.floor(w / 7)));
    const rowH = Math.max(18, Math.min(30, Math.floor(h / 6)));
    for (let wy = Y1 + 18; wy < Y2 - 12; wy += rowH) {
      for (let wx = X1 + 12; wx < X2 - 12; wx += bayW) {
        const lit = ((wx / bayW + wy / rowH + i) | 0) % 3 !== 0;
        g.fillStyle(lit ? accent : 0x314052, lit ? 0.42 : 0.3)
          .fillRect(wx, wy, Math.min(12, X2 - wx - 5), 7);
      }
    }
    g.fillStyle(accent, landmark ? 0.7 : 0.5).fillRect(X1, Y1, w, 7);
    g.fillStyle(accent, landmark ? 1 : 0.85).fillRect(X1, Y1, w, 2);
    g.fillStyle(accent, 0.28).fillRect(X1, Y1 + 7, 3, h - 7);
    g.fillStyle(0x05060f, 0.4).fillRect(X2 - 3, Y1 + 7, 3, h - 7);
    if (landmark) glow(scene, X1 + w * 0.5, Y1 + 6, accent, 2.4, 0.24, depth - 0.1);
    const sx = X1 + w / 2;
    const sy = Y2 - 5;
    g.fillStyle(0x0a0e18, 0.7).fillRect(sx - 8, sy - 5, 16, 8);
    g.fillStyle(sign, 0.85).fillRect(sx - 6, sy - 3, 12, 1);
    if (spriteKey) {
      scene.add
        .image(X1 + w / 2, Y1 + h / 2, spriteKey)
        .setDisplaySize(w * 0.96, h * 0.96)
        .setDepth(depth + 0.05)
        .setAlpha(0.95);
      hfRects.push(worldRect);
    }
    if (opts?.districtId === "relay") paintRelayIdentity(scene, X1, Y1, X2, Y2, depth, i);
    if (opts?.districtId === "undercity") paintUndercityIdentity(scene, X1, Y1, X2, Y2, depth, i);
  }
  return hfRects;
}

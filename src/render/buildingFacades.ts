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
  // Solid pad so tilemap wall cells never peek through transparent PNG edges.
  // Depth sits above tilemap (~0) and below actors (~9) — 4.x keeps roofs/walls covered.
  const pad = scene.add.graphics().setDepth(depth);
  pad.fillStyle(0x080a14, 1).fillRect(X1, Y1, w, h);
  pad.fillStyle(accent, 0.14).fillRect(X1, Y1, w, 3);
  const img = scene.add
    .image(X1 + w / 2, Y1 + h / 2, spriteKey)
    .setDisplaySize(w, h)
    .setDepth(depth + 0.05)
    .setAlpha(1);
  // Painted top-down art should filter soft when stretched across large footprints.
  try {
    scene.textures.get(spriteKey).setFilter(Phaser.Textures.FilterMode.LINEAR);
  } catch {
    /* ignore */
  }
  void img;
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
      if (landmark) glow(scene, X1 + w * 0.5, Y1 + 6, accent, 2.4, 0.22, depth + 0.12);
      hfRects.push(worldRect);
      continue;
    }

    // Small / no-art fallback: procedural kind wash + crown.
    g.fillStyle(accent, 0.2).fillRect(X1, Y1, w, h);
    g.fillStyle(0x05060f, 0.22).fillRect(X1 + 3, Y1 + 8, w - 6, h - 12);
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
  }
  return hfRects;
}
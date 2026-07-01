import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";
import { TILE } from "../config";
import type { Rect } from "../game/districts";
import {
  LANDMARK_KINDS,
  type BuildingKind,
  type CityBuilding,
} from "../world/city";

const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

function blendHex(a: number, b: number, t: number): number {
  const ch = (c: number, i: number) => (c >> i) & 0xff;
  const r = Math.round(ch(a, 16) * (1 - t) + ch(b, 16) * t);
  const g = Math.round(ch(a, 8) * (1 - t) + ch(b, 8) * t);
  const bl = Math.round(ch(a, 0) * (1 - t) + ch(b, 0) * t);
  return (r << 16) | (g << 8) | bl;
}

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

const DISTRICT_STYLES = [
  { accent: 0xff2bd6, sign: 0xff2bd6, label: "◆" },
  { accent: 0x29e7ff, sign: 0x00e5ff, label: "▣" },
  { accent: 0xff8a5c, sign: 0xffb86a, label: "⌂" },
  { accent: 0x8bff6a, sign: 0x6bdc4a, label: "⚙" },
  { accent: 0xff5a3c, sign: 0xff3b2d, label: "▲" },
] as const;

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

/** Distinct exteriors for city-hub buildings (kind + landmark aware). */
export function paintCityBuildingFacades(scene: Phaser.Scene, buildings: CityBuilding[], depth = 3.2): void {
  for (const b of buildings) {
    const style = KIND_STYLE[b.kind];
    paintFacade(scene, b.rect, b.door, style.accent, style.sign, style.glyph, depth, LANDMARK_KINDS.includes(b.kind));
  }
}

/** Combat districts — cycle roof silhouettes so blocks read as different structures. */
export function paintDistrictBuildingFacades(
  scene: Phaser.Scene,
  buildings: Rect[],
  zoneAccent: number,
  depth = 3.2,
): void {
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const style = DISTRICT_STYLES[i % DISTRICT_STYLES.length];
    const mix = blendHex(style.accent, zoneAccent, 0.35);
    const h = hash(b.x1, b.y1);
    const doorX = Math.round((b.x1 + b.x2) / 2);
    const doorY = b.y2;
    const door: [number, number] = [doorX, doorY];
    const glyph = (["shop", "home", "guild", "den", "bar"] as const)[i % 5];
    paintFacade(scene, b, (h & 3) === 0 ? door : undefined, mix, style.sign, glyph, depth, i % 3 === 0);

    // district block ID plaque on the south face
    const g = scene.add.graphics().setDepth(depth);
    const sx = ((b.x1 + b.x2) / 2) * TILE + TILE / 2;
    const sy = (b.y2 + 1) * TILE - 5;
    g.fillStyle(0x0a0e18, 0.7).fillRect(sx - 8, sy - 5, 16, 8);
    g.fillStyle(style.sign, 0.8).fillRect(sx - 6, sy - 3, 12, 1);
  }
}
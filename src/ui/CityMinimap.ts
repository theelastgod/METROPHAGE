import Phaser from "phaser";
import { TILE } from "../config";
import { isWall } from "../world/district";
import { LANDMARK_KINDS, type CityMap } from "../world/city";
import { BUILDING_LEGEND, MARKER_LEGEND, LEGEND_ORDER } from "../game/mapLegend";

/**
 * CityMinimap — a corner radar of the whole city that reads building PURPOSES by colour
 * (hospital green, subway cyan, arena red, …), with landmarks ringed so you can find the
 * hospital/subway/arena at a glance. Press M for the full WORLD MAP: the same map blown
 * up with a colour legend. City mode only; the streets are safe, so no enemy blips here
 * (the combat radar in GameScene shows those).
 */
export default class CityMinimap {
  private scene: Phaser.Scene;
  private map: CityMap;
  private base: Phaser.GameObjects.Graphics; // baked walls + building dots
  private playerG: Phaser.GameObjects.Graphics; // redrawn each frame
  private hint: Phaser.GameObjects.Text;
  private marketTile?: [number, number];
  private questTile?: [number, number];

  private worldOpen = false;
  private worldLayer: Phaser.GameObjects.GameObject[] = [];

  private readonly mw = 188;
  private readonly mh: number;
  private readonly ox: number;
  private readonly oy = 16;

  constructor(scene: Phaser.Scene, map: CityMap) {
    this.scene = scene;
    this.map = map;
    this.mh = Math.round(this.mw * (map.h / map.w));
    this.ox = scene.scale.width - this.mw - 16;
    this.base = scene.add.graphics().setScrollFactor(0).setDepth(1400);
    this.playerG = scene.add.graphics().setScrollFactor(0).setDepth(1401);
    this.drawMap(this.base, this.ox, this.oy, this.mw, this.mh, false);
    this.hint = scene.add
      .text(this.ox + this.mw, this.oy + this.mh + 4, "M world map", { fontFamily: "Courier New, monospace", fontSize: "9px", color: "#6b7184" })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1401);
  }

  setMarkers(market?: [number, number], quest?: [number, number]) {
    this.marketTile = market;
    this.questTile = quest;
    this.drawMap(this.base, this.ox, this.oy, this.mw, this.mh, false);
  }

  private px(tx: number, x: number, w: number) {
    return x + (tx / this.map.w) * w;
  }
  private py(ty: number, y: number, h: number) {
    return y + (ty / this.map.h) * h;
  }

  /** Draw the city (walls + building dots + special markers) into g at (x,y,w,h). */
  private drawMap(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, big: boolean) {
    g.clear();
    g.fillStyle(0x05060f, big ? 0.95 : 0.82).fillRect(x - 4, y - 4, w + 8, h + 8);
    g.lineStyle(2, 0x29e7ff, 0.7).strokeRect(x - 4, y - 4, w + 8, h + 8);

    const grid = this.map.grid;
    const cw = w / this.map.w;
    const ch = h / this.map.h;
    const step = big ? 1 : 2;
    g.fillStyle(0x1c2842, 0.7);
    for (let ty = 0; ty < this.map.h; ty += step) {
      for (let tx = 0; tx < this.map.w; tx += step) {
        if (isWall(grid[ty][tx])) g.fillRect(x + tx * cw, y + ty * ch, cw * step, ch * step);
      }
    }

    for (const b of this.map.buildings) {
      if (!b.door) continue;
      const e = BUILDING_LEGEND[b.kind];
      if (!e) continue;
      const bx = this.px((b.rect.x1 + b.rect.x2) / 2, x, w);
      const by = this.py((b.rect.y1 + b.rect.y2) / 2, y, h);
      const land = LANDMARK_KINDS.includes(b.kind);
      const r = big ? (land ? 5 : 3) : land ? 3.4 : 2.1;
      g.fillStyle(e.color, 1).fillCircle(bx, by, r);
      if (land) g.lineStyle(1, 0xffffff, 0.6).strokeCircle(bx, by, r + 1.8);
    }

    if (this.marketTile) {
      const mx = this.px(this.marketTile[0], x, w);
      const my = this.py(this.marketTile[1], y, h);
      g.fillStyle(MARKER_LEGEND.metro.color, 1).fillRect(mx - 2.4, my - 2.4, 4.8, 4.8);
    }
    if (this.questTile) {
      const qx = this.px(this.questTile[0], x, w);
      const qy = this.py(this.questTile[1], y, h);
      g.fillStyle(MARKER_LEGEND.quest.color, 1).fillCircle(qx, qy, big ? 4 : 2.6);
    }
  }

  /** Redraw the player blip (corner map + world map when open). */
  update(playerX: number, playerY: number) {
    const tx = playerX / TILE;
    const ty = playerY / TILE;
    this.playerG.clear();
    const dot = (x: number, y: number, w: number, h: number, big: boolean) => {
      const r = big ? 5 : 3;
      this.playerG.fillStyle(0xeafdff, 1).fillCircle(this.px(tx, x, w), this.py(ty, y, h), r);
      this.playerG.lineStyle(1.5, 0x00e5ff, 0.95).strokeCircle(this.px(tx, x, w), this.py(ty, y, h), r + 2);
    };
    dot(this.ox, this.oy, this.mw, this.mh, false);
    if (this.worldOpen) {
      const wm = this.worldRect();
      dot(wm.x, wm.y, wm.w, wm.h, true);
    }
  }

  private worldRect() {
    const sw = this.scene.scale.width;
    const sh = this.scene.scale.height;
    const w = Math.min(sw - 280, Math.round((sh - 120) * (this.map.w / this.map.h)));
    const h = Math.round(w * (this.map.h / this.map.w));
    return { x: 60, y: (sh - h) / 2, w, h };
  }

  get isWorldOpen() {
    return this.worldOpen;
  }

  toggleWorld() {
    this.worldOpen ? this.closeWorld() : this.openWorld();
  }

  private openWorld() {
    this.worldOpen = true;
    const sw = this.scene.scale.width;
    const sh = this.scene.scale.height;
    const wm = this.worldRect();
    const bg = this.scene.add.graphics().setScrollFactor(0).setDepth(1600);
    bg.fillStyle(0x02030a, 0.86).fillRect(0, 0, sw, sh);
    this.worldLayer.push(bg);
    const mapG = this.scene.add.graphics().setScrollFactor(0).setDepth(1601);
    this.drawMap(mapG, wm.x, wm.y, wm.w, wm.h, true);
    this.worldLayer.push(mapG);
    this.worldLayer.push(
      this.scene.add.text(wm.x, wm.y - 30, "▾ THE CITY — WORLD MAP", { fontFamily: "Courier New, monospace", fontSize: "16px", color: "#00e5ff", fontStyle: "bold" }).setScrollFactor(0).setDepth(1602),
    );
    // legend column
    const lx = wm.x + wm.w + 28;
    let ly = wm.y;
    const lg = this.scene.add.graphics().setScrollFactor(0).setDepth(1601);
    const row = (color: number, label: string) => {
      lg.fillStyle(color, 1).fillCircle(lx + 6, ly + 6, 5);
      this.worldLayer.push(this.scene.add.text(lx + 18, ly, label, { fontFamily: "Courier New, monospace", fontSize: "12px", color: "#cfe8ff" }).setScrollFactor(0).setDepth(1602));
      ly += 22;
    };
    this.worldLayer.push(lg);
    this.worldLayer.push(this.scene.add.text(lx, ly - 22, "LEGEND", { fontFamily: "Courier New, monospace", fontSize: "11px", color: "#6b7184" }).setScrollFactor(0).setDepth(1602));
    ly += 4;
    row(MARKER_LEGEND.player.color, MARKER_LEGEND.player.label);
    row(MARKER_LEGEND.metro.color, MARKER_LEGEND.metro.label);
    row(MARKER_LEGEND.quest.color, MARKER_LEGEND.quest.label);
    for (const k of LEGEND_ORDER) row(BUILDING_LEGEND[k].color, BUILDING_LEGEND[k].label);
    this.worldLayer.push(this.scene.add.text(wm.x, wm.y + wm.h + 10, "M / ESC to close", { fontFamily: "Courier New, monospace", fontSize: "10px", color: "#9aa3b2" }).setScrollFactor(0).setDepth(1602));
  }

  private closeWorld() {
    this.worldOpen = false;
    this.worldLayer.forEach((o) => o.destroy());
    this.worldLayer = [];
  }

  setVisible(v: boolean) {
    this.base.setVisible(v);
    this.playerG.setVisible(v);
    this.hint.setVisible(v);
    if (!v) this.closeWorld();
  }
}

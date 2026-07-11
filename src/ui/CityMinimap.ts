import Phaser from "phaser";
import { TILE } from "../config";
import { isWall } from "../world/district";
import { LANDMARK_KINDS, type CityMap } from "../world/city";
import { BUILDING_LEGEND, MARKER_LEGEND, LEGEND_ORDER } from "../game/mapLegend";
import { uiDim, uiFont } from "./uiLayout";

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
  private base: Phaser.GameObjects.Graphics;
  private playerG: Phaser.GameObjects.Graphics;
  private hint: Phaser.GameObjects.Text;
  private marketTile?: [number, number];
  private questTile?: [number, number];

  private worldOpen = false;
  private worldLayer: Phaser.GameObjects.GameObject[] = [];

  private readonly mw = uiDim(196);
  private readonly mh: number;
  private readonly ox: number;
  private readonly oy = uiDim(18);
  private readonly pad = uiDim(4);

  constructor(scene: Phaser.Scene, map: CityMap) {
    this.scene = scene;
    this.map = map;
    this.mh = Math.round(this.mw * (map.h / map.w));
    this.ox = scene.scale.width - this.mw - uiDim(18);
    this.base = scene.add.graphics().setScrollFactor(0).setDepth(1400);
    this.playerG = scene.add.graphics().setScrollFactor(0).setDepth(1401);
    this.drawMap(this.base, this.ox, this.oy, this.mw, this.mh, false);
    this.hint = scene.add
      .text(this.ox + this.mw, this.oy + this.mh + uiDim(5), "M world map", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(10),
        color: "#6b7184",
      })
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

  private drawMap(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, big: boolean) {
    g.clear();
    g.fillStyle(0x05060f, big ? 0.95 : 0.82).fillRect(x - this.pad, y - this.pad, w + this.pad * 2, h + this.pad * 2);
    g.lineStyle(uiDim(2), 0x29e7ff, 0.7).strokeRect(x - this.pad, y - this.pad, w + this.pad * 2, h + this.pad * 2);

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
      const r = big ? (land ? uiDim(5) : uiDim(3)) : land ? uiDim(3.4) : uiDim(2.1);
      g.fillStyle(e.color, 1).fillCircle(bx, by, r);
      if (land) g.lineStyle(uiDim(1), 0xffffff, 0.6).strokeCircle(bx, by, r + uiDim(1.8));
    }

    if (this.marketTile) {
      const mx = this.px(this.marketTile[0], x, w);
      const my = this.py(this.marketTile[1], y, h);
      const s = uiDim(2.4);
      g.fillStyle(MARKER_LEGEND.metro.color, 1).fillRect(mx - s, my - s, s * 2, s * 2);
    }
    if (this.questTile) {
      const qx = this.px(this.questTile[0], x, w);
      const qy = this.py(this.questTile[1], y, h);
      g.fillStyle(MARKER_LEGEND.quest.color, 1).fillCircle(qx, qy, big ? uiDim(4) : uiDim(2.6));
    }
  }

  update(playerX: number, playerY: number) {
    const tx = playerX / TILE;
    const ty = playerY / TILE;
    this.playerG.clear();
    const dot = (x: number, y: number, w: number, h: number, big: boolean) => {
      const r = big ? uiDim(5) : uiDim(3);
      this.playerG.fillStyle(0xeafdff, 1).fillCircle(this.px(tx, x, w), this.py(ty, y, h), r);
      this.playerG.lineStyle(uiDim(1.5), 0x00e5ff, 0.95).strokeCircle(this.px(tx, x, w), this.py(ty, y, h), r + uiDim(2));
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
    const w = Math.min(sw - uiDim(292), Math.round((sh - uiDim(126)) * (this.map.w / this.map.h)));
    const h = Math.round(w * (this.map.h / this.map.w));
    return { x: uiDim(64), y: (sh - h) / 2, w, h };
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
      this.scene.add
        .text(wm.x, wm.y - uiDim(32), "▾ THE CITY — WORLD MAP", {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(17),
          color: "#00e5ff",
          fontStyle: "bold",
        })
        .setScrollFactor(0)
        .setDepth(1602),
    );
    const lx = wm.x + wm.w + uiDim(30);
    let ly = wm.y;
    const lg = this.scene.add.graphics().setScrollFactor(0).setDepth(1601);
    const rowH = uiDim(24);
    const row = (color: number, label: string) => {
      lg.fillStyle(color, 1).fillCircle(lx + uiDim(6), ly + uiDim(6), uiDim(5));
      this.worldLayer.push(
        this.scene.add
          .text(lx + uiDim(20), ly, label, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(13),
            color: "#cfe8ff",
          })
          .setScrollFactor(0)
          .setDepth(1602),
      );
      ly += rowH;
    };
    this.worldLayer.push(lg);
    this.worldLayer.push(
      this.scene.add
        .text(lx, ly - rowH, "LEGEND", {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(12),
          color: "#6b7184",
        })
        .setScrollFactor(0)
        .setDepth(1602),
    );
    ly += uiDim(4);
    row(MARKER_LEGEND.player.color, MARKER_LEGEND.player.label);
    row(MARKER_LEGEND.metro.color, MARKER_LEGEND.metro.label);
    row(MARKER_LEGEND.quest.color, MARKER_LEGEND.quest.label);
    for (const k of LEGEND_ORDER) row(BUILDING_LEGEND[k].color, BUILDING_LEGEND[k].label);
    this.worldLayer.push(
      this.scene.add
        .text(wm.x, wm.y + wm.h + uiDim(12), "M / ESC to close", {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(11),
          color: "#9aa3b2",
        })
        .setScrollFactor(0)
        .setDepth(1602),
    );
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
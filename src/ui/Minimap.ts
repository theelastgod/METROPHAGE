import Phaser from "phaser";
import { VIEW_W, VIEW_H, TILE } from "../config";
import { isWall, type TileGrid } from "../world/district";
import type TuringCop from "../entities/TuringCop";
import type Boss from "../entities/Boss";

/** Live state the minimap plots (read from GameScene each frame). */
export interface MiniDot {
  x: number;
  y: number;
}

/**
 * Corner minimap / radar. Static walls are baked once; the player, enemies (elites
 * highlighted in their aura colour), territory nodes, terminals, the boss and the
 * extraction gate are re-plotted each frame. Camera-fixed, bottom-right.
 */
export default class Minimap {
  private g: Phaser.GameObjects.Graphics;
  private readonly sx: number;
  private readonly sy: number;
  private readonly ox: number;
  private readonly oy: number;
  private readonly mw = 170;
  private readonly mh = 128;

  constructor(scene: Phaser.Scene, grid: TileGrid, worldW: number, worldH: number) {
    this.sx = this.mw / worldW;
    this.sy = this.mh / worldH;
    this.ox = VIEW_W - this.mw - 10;
    this.oy = VIEW_H - this.mh - 10;

    // Static layer: panel frame + wall mass (baked once).
    const bg = scene.add.graphics().setScrollFactor(0).setDepth(1400);
    bg.fillStyle(0x05060f, 0.82).fillRect(this.ox - 3, this.oy - 3, this.mw + 6, this.mh + 6);
    bg.lineStyle(1, 0x29e7ff, 0.45).strokeRect(this.ox - 3, this.oy - 3, this.mw + 6, this.mh + 6);
    bg.fillStyle(0x1c2842, 0.9);
    const tw = TILE * this.sx + 0.6;
    const th = TILE * this.sy + 0.6;
    for (let ty = 0; ty < grid.length; ty++) {
      const row = grid[ty];
      for (let tx = 0; tx < row.length; tx++) {
        if (isWall(row[tx])) bg.fillRect(this.ox + tx * TILE * this.sx, this.oy + ty * TILE * this.sy, tw, th);
      }
    }

    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1401);
  }

  private px(x: number) {
    return this.ox + x * this.sx;
  }
  private py(y: number) {
    return this.oy + y * this.sy;
  }

  /** Re-plot the dynamic blips. */
  render(
    player: MiniDot,
    playerColor: number,
    enemies: Phaser.GameObjects.GameObject[],
    nodes: Array<MiniDot & { infected: boolean }>,
    terminals: MiniDot[],
    boss: Boss | undefined,
    gate: MiniDot | undefined,
  ) {
    const g = this.g;
    g.clear();

    for (const n of nodes) g.fillStyle(n.infected ? 0x39ff88 : 0x8a5cff, 1).fillCircle(this.px(n.x), this.py(n.y), 2);
    for (const t of terminals) g.fillStyle(0xf7ff3c, 0.85).fillCircle(this.px(t.x), this.py(t.y), 1.6);
    if (gate) {
      g.fillStyle(0x39ff88, 1).fillCircle(this.px(gate.x), this.py(gate.y), 3);
      g.lineStyle(1, 0xeafdff, 0.8).strokeCircle(this.px(gate.x), this.py(gate.y), 4);
    }

    for (const go of enemies) {
      const c = go as TuringCop;
      if (!c.active || c.isDead || c === (boss as unknown)) continue;
      if (c.elite) g.fillStyle(c.elite.aura, 1).fillCircle(this.px(c.x), this.py(c.y), 2.6);
      else g.fillStyle(0xff5a6e, 0.9).fillCircle(this.px(c.x), this.py(c.y), 1.5);
    }

    if (boss && !boss.isDead) {
      g.fillStyle(boss.def.tint, 1).fillCircle(this.px(boss.x), this.py(boss.y), 4);
      g.lineStyle(1, 0xffffff, 0.7).strokeCircle(this.px(boss.x), this.py(boss.y), 5);
    }

    g.fillStyle(0xeafdff, 1).fillCircle(this.px(player.x), this.py(player.y), 2.4);
    g.lineStyle(1, playerColor, 0.95).strokeCircle(this.px(player.x), this.py(player.y), 4);
  }
}

import Phaser from "phaser";
import { TILE } from "../config";
import { isWall, type TileGrid } from "../world/district";
import { getSettings } from "../systems/Settings";
import { bodyFont, displayFont } from "./typography";
import { drawCornerBrackets } from "./panelChrome";
import { uiDim } from "./uiLayout";

export interface MiniBlip {
  x: number;
  y: number;
  color: number;
  r?: number;
}

/**
 * Clickable zone minimap — RS-style radar; click a tile to walk there.
 */
export default class OnlineMinimap {
  onWalk?: (worldX: number, worldY: number) => void;
  private frame: Phaser.GameObjects.Graphics;
  private g: Phaser.GameObjects.Graphics;
  private zone: Phaser.GameObjects.Zone;
  private title: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private readonly ox: number;
  private readonly oy: number;
  private readonly mw = uiDim(156);
  private readonly mh = uiDim(118);
  private readonly pad = uiDim(3);
  private readonly sx: number;
  private readonly sy: number;
  private pulse = 0;

  constructor(
    scene: Phaser.Scene,
    grid: TileGrid,
    worldW: number,
    worldH: number,
  ) {
    this.sx = this.mw / worldW;
    this.sy = this.mh / worldH;
    this.ox = scene.scale.width - this.mw - uiDim(14);
    this.oy = uiDim(108);

    this.frame = scene.add.graphics().setScrollFactor(0).setDepth(1400);
    this.frame.fillStyle(0x05060f, 0.9).fillRect(this.ox - this.pad, this.oy - this.pad, this.mw + this.pad * 2, this.mh + this.pad * 2);
    this.frame.fillStyle(0x0a1428, 0.35).fillRect(this.ox - this.pad + 2, this.oy - this.pad + 2, this.mw + this.pad * 2 - 4, uiDim(12));
    this.frame.lineStyle(uiDim(2), 0x29e7ff, 0.72).strokeRect(this.ox - this.pad, this.oy - this.pad, this.mw + this.pad * 2, this.mh + this.pad * 2);
    this.frame.lineStyle(1, 0xff2bd6, 0.22).strokeRect(this.ox - this.pad + 3, this.oy - this.pad + 3, this.mw + this.pad * 2 - 6, this.mh + this.pad * 2 - 6);
    drawCornerBrackets(this.frame, this.ox - this.pad, this.oy - this.pad, this.mw + this.pad * 2, this.mh + this.pad * 2, 0x29e7ff, 0.5, uiDim(8));

    this.frame.fillStyle(0x1c2842, 0.85);
    const tw = TILE * this.sx + 0.6;
    const th = TILE * this.sy + 0.6;
    for (let ty = 0; ty < grid.length; ty++) {
      const row = grid[ty];
      for (let tx = 0; tx < row.length; tx++) {
        if (isWall(row[tx])) this.frame.fillRect(this.ox + tx * TILE * this.sx, this.oy + ty * TILE * this.sy, tw, th);
      }
    }

    this.title = scene.add
      .text(this.ox + this.mw / 2, this.oy - uiDim(14), "AREA MAP", displayFont(9, { color: "#29e7ff", fontStyle: "bold" }))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1401);

    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1401);
    this.zone = scene.add
      .zone(this.ox, this.oy, this.mw, this.mh)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1402)
      .setInteractive({ useHandCursor: true });
    this.zone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!getSettings().rsControls || pointer.rightButtonDown()) return;
      const lx = Phaser.Math.Clamp(pointer.x - this.ox, 0, this.mw);
      const ly = Phaser.Math.Clamp(pointer.y - this.oy, 0, this.mh);
      const wx = (lx / this.mw) * worldW;
      const wy = (ly / this.mh) * worldH;
      this.onWalk?.(wx, wy);
    });

    this.hint = scene.add
      .text(this.ox + this.mw, this.oy + this.mh + uiDim(4), "click to walk", bodyFont(9, { color: "#6b7184" }))
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1401);

    scene.events.on(Phaser.Scenes.Events.UPDATE, (_t: number, dt: number) => {
      this.pulse += dt * 0.004;
    });
  }

  private px(x: number) {
    return this.ox + x * this.sx;
  }
  private py(y: number) {
    return this.oy + y * this.sy;
  }

  render(player: MiniBlip, extras: MiniBlip[] = [], dest?: { x: number; y: number } | null) {
    const g = this.g;
    g.clear();
    for (const b of extras) {
      g.fillStyle(b.color, 0.9).fillCircle(this.px(b.x), this.py(b.y), b.r ?? uiDim(2));
    }
    if (dest) {
      g.lineStyle(1, 0xf7ff3c, 0.85).strokeCircle(this.px(dest.x), this.py(dest.y), uiDim(3.5) + Math.sin(this.pulse) * 0.4);
      g.fillStyle(0xf7ff3c, 0.35).fillCircle(this.px(dest.x), this.py(dest.y), uiDim(2));
    }
    g.fillStyle(0xeafdff, 1).fillCircle(this.px(player.x), this.py(player.y), uiDim(2.6));
    g.lineStyle(1, player.color, 0.95).strokeCircle(this.px(player.x), this.py(player.y), uiDim(4) + Math.sin(this.pulse) * 0.5);
  }

  destroy() {
    this.frame.destroy();
    this.g.destroy();
    this.zone.destroy();
    this.title.destroy();
    this.hint.destroy();
  }
}
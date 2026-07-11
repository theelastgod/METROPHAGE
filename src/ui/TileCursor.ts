import Phaser from "phaser";
import { TILE } from "../config";
import { worldToTile, isWalkable } from "../net/pathfind";
import type { TileGrid } from "../world/district";

export type TileCursorHint = "walk" | "blocked" | "enemy" | "npc";

/** RS-style tile highlight under the mouse — shows where you'll walk. */
export default class TileCursor {
  private g: Phaser.GameObjects.Graphics;
  private grid: TileGrid | null = null;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(3);
  }

  setGrid(grid: TileGrid) {
    this.grid = grid;
  }

  hide() {
    this.g.clear();
  }

  update(worldX: number, worldY: number, camera: Phaser.Cameras.Scene2D.Camera, hint: TileCursorHint = "walk") {
    const g = this.g;
    g.clear();
    if (!this.grid) return;
    const { tx, ty } = worldToTile(worldX, worldY);
    const x = tx * TILE;
    const y = ty * TILE;
    const onScreen =
      camera.worldView.contains(x, y) || camera.worldView.contains(x + TILE, y + TILE);
    if (!onScreen) return;

    const walkable = isWalkable(this.grid, tx, ty);
    const kind = !walkable ? "blocked" : hint;
    const fill =
      kind === "enemy" ? 0xff3b6b : kind === "npc" ? 0x00e5ff : kind === "blocked" ? 0xff3b6b : 0x39ff88;
    const alpha = kind === "blocked" ? 0.1 : 0.14;
    const stroke = kind === "blocked" ? 0.55 : 0.65;

    g.fillStyle(fill, alpha).fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    g.lineStyle(1, fill, stroke).strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);

    if (kind === "blocked") {
      g.lineStyle(2, 0xff3b6b, 0.75);
      g.lineBetween(x + 6, y + 6, x + TILE - 6, y + TILE - 6);
      g.lineBetween(x + TILE - 6, y + 6, x + 6, y + TILE - 6);
    }
  }

  destroy() {
    this.g.destroy();
  }
}
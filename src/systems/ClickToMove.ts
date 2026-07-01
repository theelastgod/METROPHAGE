import Phaser from "phaser";
import { TILE } from "../config";
import { findPath, worldToTile } from "../net/pathfind";
import type { TileGrid } from "../world/district";

const ARRIVE = TILE * 0.42;

/**
 * RuneScape-style click-to-walk — maintains a path queue and emits movement
 * intent each tick. WASD overrides cancel the path.
 */
export default class ClickToMove {
  onPathFailed?: () => void;
  private path: Array<{ x: number; y: number }> = [];
  private idx = 0;
  private marker: Phaser.GameObjects.Graphics;
  private pathG: Phaser.GameObjects.Graphics;
  private pulse = 0;
  private destX = 0;
  private destY = 0;

  constructor(scene: Phaser.Scene) {
    this.marker = scene.add.graphics().setDepth(12);
    this.pathG = scene.add.graphics().setDepth(11);
  }

  get active() {
    return this.idx < this.path.length;
  }

  get destination() {
    return this.active ? { x: this.destX, y: this.destY } : null;
  }

  cancel() {
    this.path = [];
    this.idx = 0;
    this.marker.clear();
    this.pathG.clear();
  }

  setDestination(x: number, y: number, grid: TileGrid, fromX: number, fromY: number) {
    const route = findPath(grid, fromX, fromY, x, y);
    if (!route?.length) {
      this.cancel();
      this.onPathFailed?.();
      return false;
    }
    let start = 0;
    if (route.length > 1) {
      const d0 = Math.hypot(route[0].x - fromX, route[0].y - fromY);
      if (d0 < ARRIVE) start = 1;
    }
    this.path = route.slice(start);
    this.idx = 0;
    this.destX = x;
    this.destY = y;
    this.drawMarker(x, y);
    this.drawPathPreview();
    return true;
  }

  /** Movement intent toward the next waypoint, or zero if idle. */
  intent(px: number, py: number): { mx: number; my: number } {
    if (!this.active) return { mx: 0, my: 0 };
    const wp = this.path[this.idx];
    const dx = wp.x - px;
    const dy = wp.y - py;
    const dist = Math.hypot(dx, dy);
    if (dist < ARRIVE) {
      this.idx++;
      if (!this.active) {
        this.marker.clear();
        this.pathG.clear();
        return { mx: 0, my: 0 };
      }
      this.drawPathPreview();
      return this.intent(px, py);
    }
    return { mx: dx / dist, my: dy / dist };
  }

  tick(dt: number) {
    if (!this.active) return;
    this.pulse += dt * 0.005;
    this.drawMarker(this.destX, this.destY);
  }

  private drawPathPreview() {
    const g = this.pathG;
    g.clear();
    for (let i = this.idx; i < this.path.length; i++) {
      const wp = this.path[i];
      const { tx, ty } = worldToTile(wp.x, wp.y);
      const x = tx * TILE + 2;
      const y = ty * TILE + 2;
      const fade = 0.12 + (0.22 * (i - this.idx)) / Math.max(1, this.path.length - this.idx);
      g.fillStyle(0xf7ff3c, fade).fillRect(x, y, TILE - 4, TILE - 4);
    }
  }

  private drawMarker(x: number, y: number) {
    const g = this.marker;
    g.clear();
    const s = 7 + Math.sin(this.pulse) * 1.5;
    g.fillStyle(0xf7ff3c, 0.1).fillCircle(x, y, s + 5);
    g.lineStyle(2, 0xf7ff3c, 0.9).strokeCircle(x, y, s);
    g.lineStyle(1, 0xffffff, 0.35).strokeCircle(x, y, s + 2.5);
    g.lineStyle(1, 0xf7ff3c, 0.5);
    g.lineBetween(x - s - 2, y, x + s + 2, y);
    g.lineBetween(x, y - s - 2, x, y + s + 2);
    g.fillStyle(0xf7ff3c, 0.22).fillCircle(x, y, 2.5);
  }

  destroy() {
    this.marker.destroy();
    this.pathG.destroy();
  }
}
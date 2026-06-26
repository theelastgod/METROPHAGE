import Phaser from "phaser";
import { COLORS } from "../config";
import { DISTRICTS } from "../game/districts";
import { dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";

interface MapNode {
  zone: string;
  label: string;
  color: number;
}

export default class OnlineMap {
  open = false;
  onTravel?: (zone: string) => void;
  private scene: Phaser.Scene;
  private nodes: MapNode[];
  private discovered = new Set<string>();
  private current = "";
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.nodes = [
      { zone: "safe", label: "SAFEHOUSE", color: 0x39ff88 },
      ...DISTRICTS.map((d, i) => ({ zone: "d" + i, label: d.name, color: 0x29e7ff })),
      { zone: "subway", label: "THE UNDERLINE", color: 0xff3b6b },
    ];
  }

  setState(discovered: string[], current: string) {
    this.discovered = new Set(discovered);
    this.current = current;
    if (this.open) this.build();
  }
  toggle(discovered: string[], current: string) {
    this.open = !this.open;
    if (this.open) {
      this.setState(discovered, current);
      this.build();
    } else this.clear();
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.clear();
  }
  private clear() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }

  private build() {
    this.clear();
    const scene = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const D = 1700;
    const rowH = uiDim(52);
    const cardH = uiDim(44);
    const { x, y, w, h } = modalRect(580, 116 + this.nodes.length * 52);

    add(dimBackdrop(scene, D, 0.66));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), COLORS.neonCyan, 0.85).strokeRect(x, y, w, h);

    const tx = (s: string, fx: number, fy: number, size: number, color: string, bold = false, origin = 0) =>
      add(
        scene.add
          .text(fx, fy, s, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(size),
            color,
            fontStyle: bold ? "bold" : "normal",
          })
          .setOrigin(origin, 0)
          .setScrollFactor(0)
          .setDepth(D + 3),
      );

    const found = this.nodes.filter((n) => this.discovered.has(n.zone)).length;
    tx("◇ NAVIGATION — FAST TRAVEL", x + uiDim(22), y + uiDim(16), 17, "#00e5ff", true);
    tx(`discovered ${found}/${this.nodes.length}  ·  M / ESC close`, x + w - uiDim(20), y + uiDim(20), 12, "#9aa3b2", false, 1);

    this.nodes.forEach((n, i) => {
      const ry = y + uiDim(56) + i * rowH;
      const known = this.discovered.has(n.zone) || n.zone === this.current;
      const here = n.zone === this.current;
      const hex = "#" + (n.color & 0xffffff).toString(16).padStart(6, "0");
      if (!known) {
        g.fillStyle(0x050409, 0.95).fillRect(x + uiDim(18), ry, w - uiDim(36), cardH);
        g.lineStyle(uiDim(1.4), 0x1a1726, 1).strokeRect(x + uiDim(18), ry, w - uiDim(36), cardH);
        tx("■ ??? — undiscovered", x + uiDim(32), ry + uiDim(14), 14, "#3a3550", true);
        return;
      }
      g.fillStyle(here ? 0x231a3a : 0x12102a, 0.95).fillRect(x + uiDim(18), ry, w - uiDim(36), cardH);
      g.lineStyle(here ? uiDim(2) : uiDim(1.4), here ? COLORS.neonMagenta : n.color, 1).strokeRect(x + uiDim(18), ry, w - uiDim(36), cardH);
      tx(n.label, x + uiDim(32), ry + uiDim(8), 15, hex, true);
      tx(here ? "you are here" : "fast travel", x + uiDim(32), ry + uiDim(27), 10, here ? "#ff79c6" : "#9aa3b2");
      if (here) {
        tx("◉ HERE", x + w - uiDim(32), ry + uiDim(14), 13, "#ff2bd6", true, 1);
      } else {
        const travelW = uiDim(118);
        const travelH = uiDim(26);
        g.fillStyle(0x161232, 0.96).fillRect(x + w - uiDim(18) - travelW, ry + uiDim(9), travelW, travelH);
        g.lineStyle(uiDim(1.2), n.color, 0.95).strokeRect(x + w - uiDim(18) - travelW, ry + uiDim(9), travelW, travelH);
        tx("▸ TRAVEL", x + w - uiDim(18) - travelW / 2, ry + uiDim(16), 12, "#cfe8ff", false, 0.5);
        const z = add(
          scene.add
            .zone(x + w - uiDim(18) - travelW, ry + uiDim(9), travelW, travelH)
            .setOrigin(0)
            .setScrollFactor(0)
            .setInteractive({ useHandCursor: true })
            .setDepth(D + 4),
        );
        z.on("pointerdown", () => this.onTravel?.(n.zone));
      }
    });
  }

  destroy() {
    this.clear();
  }
}
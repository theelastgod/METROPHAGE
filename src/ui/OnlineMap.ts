import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
import { DISTRICTS } from "../game/districts";

// METROPHAGE navigation map (key M) — fast travel. A zone is BLACK/locked until you've
// actually arrived there (server-tracked discovery); once discovered it lights up and you
// can fast-travel to it. The current zone is marked, not travelable. Discovery persists per
// account, so the map fills in as you explore.

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
    const w = 560;
    const h = 110 + this.nodes.length * 50;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    add(scene.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x02020a, 0.66).setScrollFactor(0).setDepth(D));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(2, COLORS.neonCyan, 0.85).strokeRect(x, y, w, h);

    const tx = (s: string, fx: number, fy: number, size: number, color: string, bold = false, origin = 0) =>
      add(
        scene.add
          .text(fx, fy, s, { fontFamily: "Courier New, monospace", fontSize: size + "px", color, fontStyle: bold ? "bold" : "normal" })
          .setOrigin(origin, 0)
          .setScrollFactor(0)
          .setDepth(D + 3),
      );

    const found = this.nodes.filter((n) => this.discovered.has(n.zone)).length;
    tx("◇ NAVIGATION — FAST TRAVEL", x + 20, y + 14, 16, "#00e5ff", true);
    tx(`discovered ${found}/${this.nodes.length}  ·  M / ESC close`, x + w - 18, y + 18, 11, "#9aa3b2", false, 1);

    this.nodes.forEach((n, i) => {
      const ry = y + 52 + i * 50;
      const known = this.discovered.has(n.zone) || n.zone === this.current;
      const here = n.zone === this.current;
      const hex = "#" + (n.color & 0xffffff).toString(16).padStart(6, "0");
      if (!known) {
        // undiscovered — black/locked
        g.fillStyle(0x050409, 0.95).fillRect(x + 16, ry, w - 32, 42);
        g.lineStyle(1.4, 0x1a1726, 1).strokeRect(x + 16, ry, w - 32, 42);
        tx("■ ??? — undiscovered", x + 30, ry + 13, 13, "#3a3550", true);
        return;
      }
      g.fillStyle(here ? 0x231a3a : 0x12102a, 0.95).fillRect(x + 16, ry, w - 32, 42);
      g.lineStyle(here ? 2 : 1.4, here ? COLORS.neonMagenta : n.color, 1).strokeRect(x + 16, ry, w - 32, 42);
      tx(n.label, x + 30, ry + 7, 14, hex, true);
      tx(here ? "you are here" : "fast travel", x + 30, ry + 25, 9, here ? "#ff79c6" : "#9aa3b2");
      if (here) {
        tx("◉ HERE", x + w - 30, ry + 13, 12, "#ff2bd6", true, 1);
      } else {
        g.fillStyle(0x161232, 0.96).fillRect(x + w - 132, ry + 9, 112, 24);
        g.lineStyle(1.2, n.color, 0.95).strokeRect(x + w - 132, ry + 9, 112, 24);
        tx("▸ TRAVEL", x + w - 76, ry + 15, 11, "#cfe8ff", false, 0.5);
        const z = add(scene.add.zone(x + w - 132, ry + 9, 112, 24).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4));
        z.on("pointerdown", () => this.onTravel?.(n.zone));
      }
    });
  }

  destroy() {
    this.clear();
  }
}

import Phaser from "phaser";
import { COLORS } from "../config";
import { repProgress } from "../game/dailies";
import { dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";

interface DailyView {
  id: string;
  name: string;
  desc: string;
  objective: string;
  count: number;
  progress: number;
  done: boolean;
  rewardCredits: number;
  rewardRep: number;
}

const OBJ_LABEL: Record<string, string> = { kill: "PURGE", capture: "CAPTURE", boss: "BOSS" };

export default class OnlineContracts {
  open = false;
  private scene: Phaser.Scene;
  private list: DailyView[] = [];
  private rep = 0;
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setState(list: DailyView[], rep: number) {
    this.list = list ?? [];
    this.rep = rep;
    if (this.open) this.build();
  }
  toggle(list: DailyView[], rep: number) {
    this.open = !this.open;
    this.list = list ?? [];
    this.rep = rep;
    if (this.open) this.build();
    else this.clear();
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
    const { x, y, w, h } = modalRect(700, 500);
    const bountyH = uiDim(80);
    const bountyGap = uiDim(4);

    add(dimBackdrop(scene, D, 0.64));
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

    tx("◎ DAILY CONTRACTS", x + uiDim(22), y + uiDim(16), 17, "#00e5ff", true);
    tx("J / ESC close · resets daily", x + w - uiDim(20), y + uiDim(18), 12, "#9aa3b2", false, 1);

    const rp = repProgress(this.rep);
    tx(`REPUTATION — ${rp.name}  (tier ${rp.tier})`, x + uiDim(22), y + uiDim(50), 13, "#f7ff3c", true);
    const barX = x + uiDim(22);
    const barW = w - uiDim(44);
    const barH = uiDim(16);
    const frac = rp.next > rp.cur ? Math.max(0, Math.min(1, (this.rep - rp.cur) / (rp.next - rp.cur))) : 1;
    g.fillStyle(0x12102a, 1).fillRect(barX, y + uiDim(68), barW, barH);
    g.fillStyle(0xf7ff3c, 0.85).fillRect(barX, y + uiDim(68), barW * frac, barH);
    g.lineStyle(uiDim(1), 0xf7ff3c, 0.6).strokeRect(barX, y + uiDim(68), barW, barH);
    tx(
      rp.next > rp.cur ? `${this.rep} / ${rp.next} → ${rp.nextName}` : `${this.rep} (MAX)`,
      x + w - uiDim(22),
      y + uiDim(86),
      10,
      "#9aa3b2",
      false,
      1,
    );

    tx("TODAY'S BOUNTIES", x + uiDim(22), y + uiDim(106), 12, "#6b7184");
    let cy = y + uiDim(126);
    if (this.list.length === 0) tx("no contracts loaded", x + uiDim(22), cy + uiDim(12), 13, "#5a6172");
    for (const d of this.list) {
      const done = d.done;
      g.fillStyle(done ? 0x11231a : 0x12102a, 0.92).fillRect(x + uiDim(22), cy, w - uiDim(44), bountyH);
      g.lineStyle(uiDim(1.4), done ? 0x39ff88 : COLORS.neonCyan, done ? 1 : 0.7).strokeRect(x + uiDim(22), cy, w - uiDim(44), bountyH);
      tx(`${done ? "✔ " : ""}${d.name}`, x + uiDim(34), cy + uiDim(10), 15, done ? "#39ff88" : "#cfe8ff", true);
      tx(`[${OBJ_LABEL[d.objective] ?? d.objective}]`, x + w - uiDim(34), cy + uiDim(12), 11, "#9aa3b2", false, 1);
      tx(d.desc, x + uiDim(34), cy + uiDim(30), 11, "#9aa3b2");
      const pf = Math.max(0, Math.min(1, d.progress / d.count));
      const pbX = x + uiDim(34);
      const pbW = w - uiDim(68) - uiDim(156);
      const pbH = uiDim(14);
      g.fillStyle(0x07061a, 1).fillRect(pbX, cy + uiDim(50), pbW, pbH);
      g.fillStyle(done ? 0x39ff88 : 0x29e7ff, 0.85).fillRect(pbX, cy + uiDim(50), pbW * pf, pbH);
      g.lineStyle(uiDim(1), done ? 0x39ff88 : 0x29e7ff, 0.6).strokeRect(pbX, cy + uiDim(50), pbW, pbH);
      tx(`${Math.min(d.progress, d.count)}/${d.count}`, pbX + pbW + uiDim(8), cy + uiDim(50), 11, "#cfe8ff");
      tx(`+₵${d.rewardCredits}  +${d.rewardRep} rep`, x + w - uiDim(34), cy + uiDim(51), 12, done ? "#39ff88" : "#f7ff3c", true, 1);
      cy += bountyH + bountyGap;
    }
  }

  destroy() {
    this.clear();
  }
}
import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
import { repProgress } from "../game/dailies";

// METROPHAGE daily contracts (key J) — the login loop. Day-seeded bounties that grant credits
// + reputation; the reputation track (top) unlocks vendor tiers. Server-authoritative: it owns
// progress + auto-grants on completion; this panel just displays net.contracts.

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
    const w = 680;
    const h = 480;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    add(scene.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x02020a, 0.64).setScrollFactor(0).setDepth(D));
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

    tx("◎ DAILY CONTRACTS", x + 20, y + 14, 16, "#00e5ff", true);
    tx("J / ESC close · resets daily", x + w - 18, y + 16, 11, "#9aa3b2", false, 1);

    // reputation track
    const rp = repProgress(this.rep);
    tx(`REPUTATION — ${rp.name}  (tier ${rp.tier})`, x + 20, y + 46, 12, "#f7ff3c", true);
    const barX = x + 20;
    const barW = w - 40;
    const frac = rp.next > rp.cur ? Math.max(0, Math.min(1, (this.rep - rp.cur) / (rp.next - rp.cur))) : 1;
    g.fillStyle(0x12102a, 1).fillRect(barX, y + 64, barW, 14);
    g.fillStyle(0xf7ff3c, 0.85).fillRect(barX, y + 64, barW * frac, 14);
    g.lineStyle(1, 0xf7ff3c, 0.6).strokeRect(barX, y + 64, barW, 14);
    tx(
      rp.next > rp.cur ? `${this.rep} / ${rp.next} → ${rp.nextName}` : `${this.rep} (MAX)`,
      x + w - 20,
      y + 80,
      9,
      "#9aa3b2",
      false,
      1,
    );

    tx("TODAY'S BOUNTIES", x + 20, y + 100, 11, "#6b7184");
    let cy = y + 120;
    if (this.list.length === 0) tx("no contracts loaded", x + 20, cy + 10, 12, "#5a6172");
    for (const d of this.list) {
      const done = d.done;
      g.fillStyle(done ? 0x11231a : 0x12102a, 0.92).fillRect(x + 20, cy, w - 40, 78);
      g.lineStyle(1.4, done ? 0x39ff88 : COLORS.neonCyan, done ? 1 : 0.7).strokeRect(x + 20, cy, w - 40, 78);
      tx(`${done ? "✔ " : ""}${d.name}`, x + 32, cy + 8, 14, done ? "#39ff88" : "#cfe8ff", true);
      tx(`[${OBJ_LABEL[d.objective] ?? d.objective}]`, x + w - 32, cy + 10, 10, "#9aa3b2", false, 1);
      tx(d.desc, x + 32, cy + 28, 10, "#9aa3b2");
      // progress bar
      const pf = Math.max(0, Math.min(1, d.progress / d.count));
      const pbX = x + 32;
      const pbW = w - 64 - 150;
      g.fillStyle(0x07061a, 1).fillRect(pbX, cy + 48, pbW, 12);
      g.fillStyle(done ? 0x39ff88 : 0x29e7ff, 0.85).fillRect(pbX, cy + 48, pbW * pf, 12);
      g.lineStyle(1, done ? 0x39ff88 : 0x29e7ff, 0.6).strokeRect(pbX, cy + 48, pbW, 12);
      tx(`${Math.min(d.progress, d.count)}/${d.count}`, pbX + pbW + 8, cy + 48, 10, "#cfe8ff");
      tx(`+₵${d.rewardCredits}  +${d.rewardRep} rep`, x + w - 32, cy + 49, 11, done ? "#39ff88" : "#f7ff3c", true, 1);
      cy += 84;
    }
  }

  destroy() {
    this.clear();
  }
}

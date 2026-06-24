import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
import { ACHIEVEMENTS, BOARD_STATS, STAT_LABELS, type StatKey } from "../game/achievements";

// METROPHAGE board (key L) — ACHIEVEMENTS (left, from the shared catalog, marking which the
// server has unlocked for you) + cross-zone LEADERBOARDS (right, fetched over HTTP from the
// Worker's /leaderboard which aggregates D1 player_stats across every zone). All read-only;
// the server owns every counter + unlock, this just visualizes them.

interface Row {
  player: string;
  name: string;
  v: number;
}

export default class OnlineBoard {
  open = false;
  private scene: Phaser.Scene;
  private httpBase: string;
  private achievements = new Set<string>();
  private selfId = "";
  private statSel: StatKey = "kills";
  private rows: Row[] = [];
  private loading = false;
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, httpBase: string) {
    this.scene = scene;
    this.httpBase = httpBase;
  }

  toggle(achievements: Set<string>, selfId: string) {
    this.open = !this.open;
    if (this.open) {
      this.achievements = achievements;
      this.selfId = selfId;
      this.build();
      void this.fetchBoard();
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

  private async fetchBoard() {
    this.loading = true;
    if (this.open) this.build();
    try {
      const r = await fetch(`${this.httpBase}/leaderboard?stat=${this.statSel}&n=12`);
      const j = (await r.json()) as { rows?: Row[] };
      this.rows = j.rows ?? [];
    } catch {
      this.rows = [];
    }
    this.loading = false;
    if (this.open) this.build();
  }

  private build() {
    this.clear();
    const scene = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const D = 1700;
    const w = 1040;
    const h = 620;
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
    tx("◈ DOSSIER — ACHIEVEMENTS + LEADERBOARDS", x + 20, y + 14, 16, "#00e5ff", true);
    tx("L / ESC close", x + w - 18, y + 16, 11, "#9aa3b2", false, 1);

    const colMid = x + w * 0.5;
    g.lineStyle(1, 0x2a2440, 0.9).lineBetween(colMid, y + 44, colMid, y + h - 16);

    // ── LEFT: achievements ──
    const unlocked = ACHIEVEMENTS.filter((a) => this.achievements.has(a.id)).length;
    tx(`ACHIEVEMENTS  ${unlocked}/${ACHIEVEMENTS.length}`, x + 20, y + 48, 12, "#f7ff3c", true);
    const ax = x + 20;
    let ay = y + 72;
    const aw = w * 0.5 - 36;
    for (const a of ACHIEVEMENTS) {
      const got = this.achievements.has(a.id);
      g.fillStyle(got ? 0x11231a : 0x12102a, 0.9).fillRect(ax, ay, aw, 34);
      g.lineStyle(1.2, got ? 0x39ff88 : 0x3a3350, got ? 1 : 0.5).strokeRect(ax, ay, aw, 34);
      tx(`${got ? "★" : "☆"} ${a.name}`, ax + 8, ay + 4, 11, got ? "#39ff88" : "#7a8190", true);
      tx(a.desc, ax + 8, ay + 19, 9, got ? "#cfe8ff" : "#5a6172");
      tx(`+₵${a.reward}`, ax + aw - 8, ay + 9, 10, got ? "#f7ff3c" : "#5a6172", false, 1);
      ay += 38;
    }

    // ── RIGHT: leaderboard, with a stat-tab picker ──
    const bx = colMid + 16;
    const bw = x + w - 16 - bx;
    tx("LEADERBOARD", bx, y + 48, 12, "#f7ff3c", true);
    // tabs — wrap to a new row when they'd overflow the column (6 stats → 2 rows)
    let tabX = bx;
    let tabY = y + 70;
    const tabRight = x + w - 16;
    for (const s of BOARD_STATS) {
      const label = STAT_LABELS[s];
      const sel = s === this.statSel;
      const tw = Math.max(72, label.length * 6.0 + 14);
      if (tabX + tw > tabRight) {
        tabX = bx;
        tabY += 26;
      }
      g.fillStyle(sel ? 0x231a3a : 0x12102a, 0.95).fillRect(tabX, tabY, tw, 22);
      g.lineStyle(1.2, sel ? COLORS.neonMagenta : 0x3a3350, sel ? 1 : 0.6).strokeRect(tabX, tabY, tw, 22);
      tx(label, tabX + tw / 2, tabY + 5, 8.5, sel ? "#ff2bd6" : "#9aa3b2", sel, 0.5);
      const z = add(scene.add.zone(tabX, tabY, tw, 22).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4));
      const stat = s;
      z.on("pointerdown", () => {
        if (this.statSel !== stat) {
          this.statSel = stat;
          void this.fetchBoard();
        }
      });
      tabX += tw + 6;
    }

    let ry = tabY + 34;
    tx(`RANK · ${STAT_LABELS[this.statSel]}`, bx, ry, 10, "#6b7184");
    ry += 18;
    if (this.loading) {
      tx("loading…", bx, ry + 10, 12, "#9aa3b2");
    } else if (this.rows.length === 0) {
      tx("no ranked players yet — go make a name", bx, ry + 10, 11, "#5a6172");
    } else {
      this.rows.forEach((row, i) => {
        const me = row.player === this.selfId;
        const rh = 30;
        g.fillStyle(me ? 0x231a3a : i % 2 ? 0x0e0c1c : 0x12102a, 0.9).fillRect(bx, ry, bw, rh);
        if (me) g.lineStyle(1.4, COLORS.neonMagenta, 1).strokeRect(bx, ry, bw, rh);
        const rankColor = i === 0 ? "#f7ff3c" : i === 1 ? "#cfe8ff" : i === 2 ? "#ff7a3c" : "#9aa3b2";
        tx(`#${i + 1}`, bx + 10, ry + 7, 12, rankColor, true);
        tx(row.name || row.player, bx + 56, ry + 7, 12, me ? "#ff2bd6" : "#cfe8ff", me);
        tx(String(row.v), bx + bw - 12, ry + 7, 12, "#39ff88", true, 1);
        ry += rh + 3;
      });
    }
  }

  destroy() {
    this.clear();
  }
}

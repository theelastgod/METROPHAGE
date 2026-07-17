import Phaser from "phaser";
import { COLORS } from "../config";
import { ACHIEVEMENTS, BOARD_STATS, STAT_LABELS, type StatKey } from "../game/achievements";
import { publicPlayerKey } from "../net/protocol";
import Modal from "./Modal";
import { closeHint, dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";

interface Row {
  /** Opaque digest of the player id — the server no longer publishes raw ids
   *  (for wallet runners the id is their on-chain address). */
  key: string;
  name: string;
  v: number;
}

export default class OnlineBoard extends Modal {
  private httpBase: string;
  private achievements = new Set<string>();
  private selfId = "";
  /** Digest of selfId — the board publishes digests, so match on the same shape. */
  private selfKey = "";
  private statSel: StatKey = "kills";
  private rows: Row[] = [];
  private loading = false;

  constructor(scene: Phaser.Scene, httpBase: string) {
    super(scene);
    this.httpBase = httpBase;
  }

  toggle(achievements: Set<string>, selfId: string) {
    this.achievements = achievements;
    if (selfId !== this.selfId) {
      this.selfId = selfId;
      this.selfKey = "";
      // Async, but the board re-builds when rows land; highlight resolves then.
      void publicPlayerKey(selfId).then((k) => {
        this.selfKey = k;
        if (this.open) this.build();
      });
    }
    this.toggleOpen();
    if (this.open) void this.fetchBoard();
  }

  private async fetchBoard() {
    this.loading = true;
    if (this.open) this.build();
    try {
      const r = await fetch(`${this.httpBase}/leaderboard?stat=${this.statSel}&n=9`);
      const j = (await r.json()) as { rows?: Row[] };
      this.rows = j.rows ?? [];
    } catch {
      this.rows = [];
    }
    this.loading = false;
    if (this.open) this.build();
  }

  protected build() {
    this.clear();
    const scene = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const D = 1700;
    // design space is 960×540 — the old 1060×640 hung off every edge of the screen,
    // and the un-capped achievement list overflowed even its own panel.
    const { x, y, w, h } = modalRect(880, 496);
    const achRowH = uiDim(32);
    const tabH = uiDim(22);
    const rankRowH = uiDim(28);

    add(dimBackdrop(scene, D, 0.66, () => this.close(), { x, y, w, h }));
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
    tx("◈ DOSSIER — ACHIEVEMENTS + LEADERBOARDS", x + uiDim(22), y + uiDim(16), 17, "#00e5ff", true);
    tx(closeHint("L / ESC close"), x + w - uiDim(20), y + uiDim(18), 12, "#9aa3b2", false, 1);

    const colMid = x + w * 0.5;
    g.lineStyle(uiDim(1), 0x2a2440, 0.9).lineBetween(colMid, y + uiDim(48), colMid, y + h - uiDim(18));

    const unlocked = ACHIEVEMENTS.filter((a) => this.achievements.has(a.id)).length;
    tx(`ACHIEVEMENTS  ${unlocked}/${ACHIEVEMENTS.length}`, x + uiDim(22), y + uiDim(52), 13, "#f7ff3c", true);
    const ax = x + uiDim(22);
    let ay = y + uiDim(76);
    const aw = w * 0.5 - uiDim(38);
    // earned first so progress reads at a glance, then the nearest goals; cap to the panel
    const ordered = [...ACHIEVEMENTS.filter((a) => this.achievements.has(a.id)), ...ACHIEVEMENTS.filter((a) => !this.achievements.has(a.id))];
    let shown = 0;
    for (const a of ordered) {
      if (ay + achRowH > y + h - uiDim(34)) break; // leave room for the "+N more" footer
      const got = this.achievements.has(a.id);
      const cardH = uiDim(30);
      g.fillStyle(got ? 0x11231a : 0x12102a, 0.9).fillRect(ax, ay, aw, cardH);
      g.lineStyle(uiDim(1.2), got ? 0x39ff88 : 0x3a3350, got ? 1 : 0.5).strokeRect(ax, ay, aw, cardH);
      tx(`${got ? "★" : "☆"} ${a.name}`, ax + uiDim(10), ay + uiDim(4), 11, got ? "#39ff88" : "#7a8190", true);
      tx(a.desc, ax + uiDim(10), ay + uiDim(17), 9, got ? "#cfe8ff" : "#5a6172");
      tx(`+₵${a.reward}`, ax + aw - uiDim(10), ay + uiDim(8), 10, got ? "#f7ff3c" : "#5a6172", false, 1);
      ay += achRowH;
      shown++;
    }
    if (shown < ordered.length) tx(`+${ordered.length - shown} more to uncover…`, ax, ay + uiDim(2), 10, "#6b7184");

    const bx = colMid + uiDim(18);
    const bw = x + w - uiDim(18) - bx;
    tx("LEADERBOARD", bx, y + uiDim(52), 13, "#f7ff3c", true);
    let tabX = bx;
    let tabY = y + uiDim(74);
    const tabRight = x + w - uiDim(18);
    for (const s of BOARD_STATS) {
      const label = STAT_LABELS[s];
      const sel = s === this.statSel;
      const tw = Math.max(uiDim(76), uiDim(label.length * 6.0 + 14));
      if (tabX + tw > tabRight) {
        tabX = bx;
        tabY += uiDim(28);
      }
      g.fillStyle(sel ? 0x231a3a : 0x12102a, 0.95).fillRect(tabX, tabY, tw, tabH);
      g.lineStyle(uiDim(1.2), sel ? COLORS.neonMagenta : 0x3a3350, sel ? 1 : 0.6).strokeRect(tabX, tabY, tw, tabH);
      tx(label, tabX + tw / 2, tabY + uiDim(6), 9, sel ? "#ff2bd6" : "#9aa3b2", sel, 0.5);
      const z = add(
        scene.add.zone(tabX, tabY, tw, tabH).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4),
      );
      const stat = s;
      z.on("pointerdown", () => {
        if (this.statSel !== stat) {
          this.statSel = stat;
          void this.fetchBoard();
        }
      });
      tabX += tw + uiDim(6);
    }

    let ry = tabY + uiDim(36);
    tx(`RANK · ${STAT_LABELS[this.statSel]}`, bx, ry, 11, "#6b7184");
    ry += uiDim(20);
    if (this.loading) {
      tx("loading…", bx, ry + uiDim(12), 13, "#9aa3b2");
    } else if (this.rows.length === 0) {
      tx("no ranked players yet — go make a name", bx, ry + uiDim(12), 12, "#5a6172");
    } else {
      this.rows.forEach((row, i) => {
        const me = !!row.key && row.key === this.selfKey;
        g.fillStyle(me ? 0x231a3a : i % 2 ? 0x0e0c1c : 0x12102a, 0.9).fillRect(bx, ry, bw, rankRowH);
        if (me) g.lineStyle(uiDim(1.4), COLORS.neonMagenta, 1).strokeRect(bx, ry, bw, rankRowH);
        const rankColor = i === 0 ? "#f7ff3c" : i === 1 ? "#cfe8ff" : i === 2 ? "#ff7a3c" : "#9aa3b2";
        tx(`#${i + 1}`, bx + uiDim(12), ry + uiDim(8), 13, rankColor, true);
        tx(row.name, bx + uiDim(60), ry + uiDim(8), 13, me ? "#ff2bd6" : "#cfe8ff", me);
        tx(String(row.v), bx + bw - uiDim(14), ry + uiDim(8), 13, "#39ff88", true, 1);
        ry += rankRowH + uiDim(3);
      });
    }
  }

}
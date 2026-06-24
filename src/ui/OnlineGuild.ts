import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
import { GUILD_CREATE_COST, guildXpForLevel } from "../game/guilds";

// METROPHAGE Cell panel (key C) — your guild's bank, level, roster + rank. All mutations are
// server-authoritative (the bank is dupe-proof D1); this panel shows state + fires quick
// deposit/withdraw/leave intents. Founding, invites, ranks + amounts also work via /g chat
// commands (see OnlineScene). Cross-zone: the registry lives in shared D1.

interface GuildState {
  id: number;
  name: string;
  tag: string;
  level: number;
  xp: number;
  bankCredits: number;
  bankCores: number;
  rank: string;
  members: Array<{ id: string; rank: string }>;
}

export default class OnlineGuild {
  open = false;
  onAction?: (action: "deposit" | "withdraw" | "leave" | "info", credits?: number, cores?: number) => void;
  private scene: Phaser.Scene;
  private guild: GuildState | null = null;
  private selfId = "";
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setGuild(g: GuildState | null, selfId: string) {
    this.guild = g;
    this.selfId = selfId;
    if (this.open) this.build();
  }
  toggle(g: GuildState | null, selfId: string) {
    this.open = !this.open;
    this.guild = g;
    this.selfId = selfId;
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
    const w = 640;
    const h = 520;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    add(scene.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x02020a, 0.64).setScrollFactor(0).setDepth(D));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(2, COLORS.neonGreen, 0.85).strokeRect(x, y, w, h);

    const tx = (s: string, fx: number, fy: number, size: number, color: string, bold = false, origin = 0) =>
      add(
        scene.add
          .text(fx, fy, s, { fontFamily: "Courier New, monospace", fontSize: size + "px", color, fontStyle: bold ? "bold" : "normal" })
          .setOrigin(origin, 0)
          .setScrollFactor(0)
          .setDepth(D + 3),
      );
    const btn = (bx: number, by: number, bw: number, label: string, color: number, fn: () => void) => {
      g.fillStyle(0x161232, 0.96).fillRect(bx, by, bw, 26);
      g.lineStyle(1.3, color, 0.95).strokeRect(bx, by, bw, 26);
      tx(label, bx + bw / 2, by + 7, 11, "#cfe8ff", false, 0.5);
      const z = add(scene.add.zone(bx, by, bw, 26).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4));
      z.on("pointerdown", fn);
    };

    tx("⬡ CELL", x + 18, y + 12, 16, "#39ff88", true);
    tx("C / ESC close", x + w - 18, y + 14, 11, "#9aa3b2", false, 1);

    if (!this.guild) {
      tx("You're not in a Cell.", x + 24, y + 56, 13, "#cfe8ff", true);
      tx("A Cell is a player-run resistance group — a shared bank, a level, and a", x + 24, y + 84, 11, "#9aa3b2");
      tx("credit-find perk for every member. Found one or accept an invite:", x + 24, y + 100, 11, "#9aa3b2");
      const cmds = [
        [`/gcreate <TAG> <name>`, `found a Cell (costs ₵${GUILD_CREATE_COST})`],
        ["/gjoin", "accept your latest invite"],
        ["/ginvite <id>", "invite a player (leader/officer)"],
        ["/g <message>", "Cell chat"],
      ];
      let cy = y + 134;
      for (const [c, d] of cmds) {
        tx(c, x + 30, cy, 12, "#f7ff3c", true);
        tx(d, x + 250, cy, 11, "#9aa3b2");
        cy += 26;
      }
      return;
    }

    const gd = this.guild;
    tx(`[${gd.tag}] ${gd.name}`, x + 90, y + 16, 15, "#39ff88", true);
    // level + xp bar
    const lvY = y + 50;
    tx(`CELL LEVEL ${gd.level}`, x + 24, lvY, 12, "#f7ff3c", true);
    const barX = x + 170;
    const barW = w - 170 - 24;
    const cur = guildXpForLevel(gd.level);
    const next = guildXpForLevel(gd.level + 1);
    const frac = next > cur ? Math.max(0, Math.min(1, (gd.xp - cur) / (next - cur))) : 1;
    g.fillStyle(0x12102a, 1).fillRect(barX, lvY, barW, 14);
    g.fillStyle(0x39ff88, 0.85).fillRect(barX, lvY, barW * frac, 14);
    g.lineStyle(1, 0x39ff88, 0.7).strokeRect(barX, lvY, barW, 14);
    tx(`${gd.xp} XP`, barX + barW, lvY + 16, 9, "#6b7184", false, 1);

    // bank
    const bkY = y + 92;
    g.fillStyle(0x12102a, 0.9).fillRect(x + 24, bkY, w - 48, 40);
    g.lineStyle(1.2, COLORS.neonYellow, 0.7).strokeRect(x + 24, bkY, w - 48, 40);
    tx("CELL BANK", x + 36, bkY + 6, 10, "#6b7184");
    tx(`₵ ${gd.bankCredits}     ◈ ${gd.bankCores}`, x + 36, bkY + 20, 14, "#f7ff3c", true);
    tx(`your rank: ${gd.rank.toUpperCase()}`, x + w - 36, bkY + 14, 11, "#cfe8ff", false, 1);

    // quick bank buttons (amounts are clamped server-side to your balance / the bank)
    const officer = gd.rank === "leader" || gd.rank === "officer";
    let bx = x + 24;
    const by = y + 144;
    btn(bx, by, 120, "DEPOSIT ₵100", COLORS.neonGreen, () => this.onAction?.("deposit", 100, 0));
    bx += 128;
    btn(bx, by, 120, "DEPOSIT ₵500", COLORS.neonGreen, () => this.onAction?.("deposit", 500, 0));
    bx += 128;
    if (officer) {
      btn(bx, by, 130, "WITHDRAW ₵100", COLORS.neonCyan, () => this.onAction?.("withdraw", 100, 0));
      bx += 138;
    }
    btn(bx, by, 100, "LEAVE", COLORS.neonMagenta, () => this.onAction?.("leave"));
    tx("more: /gdep <c> [k] · /gwd <c> [k] · /gpromote <id> · /gkick <id> · /g <msg>", x + 24, by + 34, 10, "#6b7184");

    // roster
    tx(`ROSTER (${gd.members.length})`, x + 24, y + 196, 12, "#f7ff3c", true);
    let ry = y + 218;
    for (const m of gd.members.slice(0, 12)) {
      const me = m.id === this.selfId;
      g.fillStyle(me ? 0x231a3a : 0x12102a, 0.9).fillRect(x + 24, ry, w - 48, 22);
      const rankColor = m.rank === "leader" ? "#f7ff3c" : m.rank === "officer" ? "#29e7ff" : "#9aa3b2";
      tx(m.id, x + 34, ry + 4, 11, me ? "#ff2bd6" : "#cfe8ff", me);
      tx(m.rank.toUpperCase(), x + w - 36, ry + 4, 10, rankColor, false, 1);
      ry += 25;
    }
  }

  destroy() {
    this.clear();
  }
}

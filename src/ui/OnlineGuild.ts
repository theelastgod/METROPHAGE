import Phaser from "phaser";
import { COLORS } from "../config";
import { GUILD_CREATE_COST, guildXpForLevel } from "../game/guilds";
import { weeklyGuildGoal } from "../game/guildGoals";
import Modal from "./Modal";
import { closeHint, dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";

interface GuildGoalState {
  id: string;
  name: string;
  desc: string;
  target: number;
  progress: number;
  claimed: boolean;
  rewardCredits: number;
}

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
  goal?: GuildGoalState;
}

export default class OnlineGuild extends Modal {
  onAction?: (
    action: "deposit" | "withdraw" | "leave" | "info" | "claim_goal",
    credits?: number,
    cores?: number,
  ) => void;
  private guild: GuildState | null = null;
  private selfId = "";

  setGuild(g: GuildState | null, selfId: string) {
    this.guild = g;
    this.selfId = selfId;
    if (this.open) this.build();
  }
  toggle(g: GuildState | null, selfId: string) {
    this.guild = g;
    this.selfId = selfId;
    this.toggleOpen();
  }

  protected build() {
    this.clear();
    const scene = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const D = 1700;
    const { x, y, w, h } = modalRect(660, 560);
    const btnH = uiDim(28);
    const rosterH = uiDim(24);

    add(dimBackdrop(scene, D, 0.64, () => this.close(), { x, y, w, h }));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), COLORS.neonGreen, 0.85).strokeRect(x, y, w, h);

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
    const btn = (bx: number, by: number, bw: number, label: string, color: number, fn: () => void) => {
      g.fillStyle(0x161232, 0.96).fillRect(bx, by, bw, btnH);
      g.lineStyle(uiDim(1.3), color, 0.95).strokeRect(bx, by, bw, btnH);
      tx(label, bx + bw / 2, by + uiDim(8), 12, "#cfe8ff", false, 0.5);
      const z = add(
        scene.add.zone(bx, by, bw, btnH).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4),
      );
      z.on("pointerdown", fn);
    };

    tx("⬡ CELL", x + uiDim(20), y + uiDim(14), 17, "#39ff88", true);
    tx(closeHint("U / ESC close"), x + w - uiDim(20), y + uiDim(16), 12, "#9aa3b2", false, 1);

    // Weekly goal — prefer server-tallied state when in a cell, else static seed.
    const seed = weeklyGuildGoal();
    const sg = this.guild?.goal;
    const goalName = sg?.name ?? seed.name;
    const goalDesc = sg?.desc ?? seed.desc;
    const goalTarget = sg?.target ?? seed.target;
    const goalProg = Math.max(0, sg?.progress ?? 0);
    const goalClaimed = !!sg?.claimed;
    const goalReward = sg?.rewardCredits ?? seed.rewardCredits;
    const goalFrac = goalTarget > 0 ? Math.max(0, Math.min(1, goalProg / goalTarget)) : 0;
    const goalDone = goalProg >= goalTarget;

    tx(`WEEKLY · ${goalName}: ${goalDesc}`, x + uiDim(20), y + uiDim(36), 10, "#d4c45a");
    const gBarX = x + uiDim(20);
    const gBarY = y + uiDim(52);
    const gBarW = w - uiDim(40) - (this.guild && goalDone && !goalClaimed ? uiDim(110) : 0);
    const gBarH = uiDim(14);
    g.fillStyle(0x12102a, 1).fillRect(gBarX, gBarY, gBarW, gBarH);
    g.fillStyle(goalDone ? 0xf7ff3c : 0x29e7ff, 0.9).fillRect(gBarX, gBarY, gBarW * goalFrac, gBarH);
    g.lineStyle(uiDim(1), 0x29e7ff, 0.7).strokeRect(gBarX, gBarY, gBarW, gBarH);
    tx(
      goalClaimed
        ? `CLAIMED · ₵${goalReward}`
        : `${goalProg}/${goalTarget} · reward ₵${goalReward}${seed.rewardRep ? ` + ${seed.rewardRep} rep` : ""}`,
      gBarX + gBarW / 2,
      gBarY + uiDim(1),
      9,
      goalClaimed ? "#39ff88" : "#eafdff",
      true,
      0.5,
    );
    if (this.guild && goalDone && !goalClaimed) {
      btn(x + w - uiDim(120), gBarY - uiDim(6), uiDim(100), "CLAIM", COLORS.neonYellow, () => this.onAction?.("claim_goal"));
    }

    if (!this.guild) {
      tx("You're not in a Cell.", x + uiDim(26), y + uiDim(82), 14, "#cfe8ff", true);
      tx("A Cell is a player-run resistance group — a shared bank, a level, and a", x + uiDim(26), y + uiDim(112), 12, "#9aa3b2");
      tx("credit-find perk for every member. Found one or accept an invite:", x + uiDim(26), y + uiDim(130), 12, "#9aa3b2");
      const cmds = [
        [`/gcreate <TAG> <name>`, `found a Cell (costs ₵${GUILD_CREATE_COST})`],
        ["/gjoin", "accept your latest invite"],
        ["/ginvite <id>", "invite a player (leader/officer)"],
        ["/g <message>", "Cell chat"],
      ];
      let cy = y + uiDim(164);
      for (const [c, d] of cmds) {
        tx(c, x + uiDim(32), cy, 13, "#f7ff3c", true);
        tx(d, x + uiDim(260), cy, 12, "#9aa3b2");
        cy += uiDim(28);
      }
      return;
    }

    const gd = this.guild;
    tx(`[${gd.tag}] ${gd.name}`, x + uiDim(96), y + uiDim(18), 16, "#39ff88", true);
    const lvY = y + uiDim(78);
    tx(`CELL LEVEL ${gd.level}`, x + uiDim(26), lvY, 13, "#f7ff3c", true);
    const barX = x + uiDim(180);
    const barW = w - uiDim(180) - uiDim(26);
    const barH = uiDim(16);
    const cur = guildXpForLevel(gd.level);
    const next = guildXpForLevel(gd.level + 1);
    const frac = next > cur ? Math.max(0, Math.min(1, (gd.xp - cur) / (next - cur))) : 1;
    g.fillStyle(0x12102a, 1).fillRect(barX, lvY, barW, barH);
    g.fillStyle(0x39ff88, 0.85).fillRect(barX, lvY, barW * frac, barH);
    g.lineStyle(uiDim(1), 0x39ff88, 0.7).strokeRect(barX, lvY, barW, barH);
    tx(`${gd.xp} XP`, barX + barW, lvY + uiDim(18), 10, "#6b7184", false, 1);

    const bkY = y + uiDim(112);
    const bankH = uiDim(44);
    g.fillStyle(0x12102a, 0.9).fillRect(x + uiDim(26), bkY, w - uiDim(52), bankH);
    g.lineStyle(uiDim(1.2), COLORS.neonYellow, 0.7).strokeRect(x + uiDim(26), bkY, w - uiDim(52), bankH);
    tx("CELL BANK", x + uiDim(38), bkY + uiDim(8), 11, "#6b7184");
    tx(`₵ ${gd.bankCredits}     ◈ ${gd.bankCores}`, x + uiDim(38), bkY + uiDim(22), 15, "#f7ff3c", true);
    tx(`your rank: ${gd.rank.toUpperCase()}`, x + w - uiDim(38), bkY + uiDim(16), 12, "#cfe8ff", false, 1);

    const officer = gd.rank === "leader" || gd.rank === "officer";
    let bx = x + uiDim(26);
    const by = y + uiDim(168);
    btn(bx, by, uiDim(126), "DEPOSIT ₵100", COLORS.neonGreen, () => this.onAction?.("deposit", 100, 0));
    bx += uiDim(134);
    btn(bx, by, uiDim(126), "DEPOSIT ₵500", COLORS.neonGreen, () => this.onAction?.("deposit", 500, 0));
    bx += uiDim(134);
    if (officer) {
      btn(bx, by, uiDim(136), "WITHDRAW ₵100", COLORS.neonCyan, () => this.onAction?.("withdraw", 100, 0));
      bx += uiDim(144);
    }
    btn(bx, by, uiDim(106), "LEAVE", COLORS.neonMagenta, () => this.onAction?.("leave"));
    tx("more: /gdep <c> [k] · /gwd <c> [k] · /gpromote <id> · /gkick <id> · /g <msg>", x + uiDim(26), by + uiDim(36), 11, "#6b7184");

    tx(`ROSTER (${gd.members.length})`, x + uiDim(26), y + uiDim(224), 13, "#f7ff3c", true);
    let ry = y + uiDim(246);
    for (const m of gd.members.slice(0, 11)) {
      const me = m.id === this.selfId;
      g.fillStyle(me ? 0x231a3a : 0x12102a, 0.9).fillRect(x + uiDim(26), ry, w - uiDim(52), rosterH);
      const rankColor = m.rank === "leader" ? "#f7ff3c" : m.rank === "officer" ? "#29e7ff" : "#9aa3b2";
      tx(m.id, x + uiDim(36), ry + uiDim(5), 12, me ? "#ff2bd6" : "#cfe8ff", me);
      tx(m.rank.toUpperCase(), x + w - uiDim(38), ry + uiDim(5), 11, rankColor, false, 1);
      ry += rosterH + uiDim(3);
    }
  }
}

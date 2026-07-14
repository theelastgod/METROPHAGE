// Small, quiet multi-choice talk menu for NPCs with a real extra (heal / tip / job…).

import Phaser from "phaser";
import { dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";
import { bodyFont, displayFont } from "./typography";
import {
  NPC_SERVICES,
  npcRoleLabel,
  servicesForNpc,
  type NpcServiceId,
} from "../game/npcServices";
import { bountyForNpc } from "../game/bounties";

export interface NpcTalkOption {
  id: NpcServiceId;
  label: string;
  hint: string;
  color: string;
  disabled?: boolean;
  disabledReason?: string;
}

export default class NpcTalkPanel {
  private scene: Phaser.Scene;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private open = false;
  private backdrop?: Phaser.GameObjects.Container;
  private npcId = "";
  private npcName = "";
  onPick?: (service: NpcServiceId, npcId: string, npcName: string) => void;
  onClose?: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get isOpen() {
    return this.open;
  }

  get currentNpcId() {
    return this.npcId;
  }

  show(opts: {
    npcId: string;
    name: string;
    line: string;
    credits: number;
    cores: number;
    hasBountyActive: boolean;
    activeBountyId: string | null;
  }) {
    this.clear();
    this.open = true;
    this.npcId = opts.npcId;
    this.npcName = opts.name;

    const hasBountyDef = !!bountyForNpc(opts.npcId);
    const services = servicesForNpc(opts.npcId, hasBountyDef);
    const options: NpcTalkOption[] = [];
    for (const id of services) {
      const def = NPC_SERVICES[id];
      if (!def) continue;
      if (id === "bounty") {
        const b = bountyForNpc(opts.npcId);
        if (!b) continue;
        if (opts.hasBountyActive && opts.activeBountyId !== b.id) {
          options.push({
            id,
            label: def.label,
            hint: "finish your current job first",
            color: def.color,
            disabled: true,
          });
          continue;
        }
        if (opts.activeBountyId === b.id) {
          options.push({ id, label: "Job status", hint: b.desc, color: def.color });
          continue;
        }
        options.push({ id, label: def.label, hint: b.name, color: def.color });
        continue;
      }
      if (id === "sell_core" && opts.cores < 1) {
        options.push({ id, label: def.label, hint: "need a core", color: def.color, disabled: true });
        continue;
      }
      if (def.cost > 0 && opts.credits < def.cost) {
        options.push({
          id,
          label: def.label,
          hint: def.hint,
          color: def.color,
          disabled: true,
          disabledReason: `need ₵${def.cost}`,
        });
        continue;
      }
      options.push({ id, label: def.label, hint: def.hint, color: def.color });
    }
    if (!options.some((o) => o.id === "chat")) {
      options.unshift({ id: "chat", label: "Talk", hint: "just talk", color: "#9aa3b2" });
    }

    // Compact: quote + up to 4 choices (most NPCs only have 2).
    const rows = Math.min(options.length, 4);
    const D = 1740;
    const h = uiDim(96) + rows * uiDim(36) + uiDim(18);
    const { x, y, w } = modalRect(400, Math.min(h, 280));
    this.backdrop = dimBackdrop(this.scene, D, 0.35, () => this.close(), { x, y, w, h: Math.min(h, 280) });

    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const g = add(this.scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    const panelH = Math.min(h, 280);
    g.fillStyle(0x080a12, 0.94).fillRect(x, y, w, panelH);
    g.lineStyle(uiDim(1), 0x3a4560, 0.85).strokeRect(x, y, w, panelH);

    const role = npcRoleLabel(opts.npcId);
    add(
      this.scene.add
        .text(x + uiDim(14), y + uiDim(10), `${opts.name}`, displayFont(12, { color: "#c8d0dc", fontStyle: "bold" }))
        .setScrollFactor(0)
        .setDepth(D + 3),
    );
    add(
      this.scene.add
        .text(x + w - uiDim(12), y + uiDim(12), role, bodyFont(9, { color: "#5a6478" }))
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(D + 3),
    );

    const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
    add(
      this.scene.add
        .text(x + uiDim(14), y + uiDim(34), clip(opts.line, 90), {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(10),
          color: "#8a94a8",
          wordWrap: { width: w - uiDim(28) },
          fontStyle: "italic",
        })
        .setScrollFactor(0)
        .setDepth(D + 3),
    );

    let by = y + uiDim(72);
    for (let i = 0; i < rows; i++) {
      const opt = options[i];
      const bh = uiDim(30);
      const bw = w - uiDim(28);
      const bx = x + uiDim(14);
      const muted = !!opt.disabled;
      const col = parseInt(opt.color.replace("#", ""), 16) || 0x9aa3b2;
      g.fillStyle(0x10141e, muted ? 0.4 : 0.85).fillRoundedRect(bx, by, bw, bh, 3);
      g.lineStyle(uiDim(1), col, muted ? 0.25 : 0.45).strokeRoundedRect(bx, by, bw, bh, 3);

      const label = add(
        this.scene.add
          .text(bx + uiDim(10), by + uiDim(5), opt.label, bodyFont(11, { color: muted ? "#4a5160" : "#d0d6e0", fontStyle: "bold" }))
          .setScrollFactor(0)
          .setDepth(D + 4),
      );
      add(
        this.scene.add
          .text(bx + uiDim(10), by + uiDim(17), opt.disabledReason ?? opt.hint, bodyFont(8, { color: muted ? "#3a4050" : "#6a7488" }))
          .setScrollFactor(0)
          .setDepth(D + 4),
      );

      if (!muted) {
        const zone = add(
          this.scene.add
            .zone(bx, by, bw, bh)
            .setOrigin(0)
            .setScrollFactor(0)
            .setDepth(D + 5)
            .setInteractive({ useHandCursor: true }),
        );
        zone.on("pointerover", () => label.setColor("#ffffff"));
        zone.on("pointerout", () => label.setColor("#d0d6e0"));
        zone.on("pointerdown", () => {
          const pick = this.onPick;
          const id = this.npcId;
          const name = this.npcName;
          this.close();
          pick?.(opt.id, id, name);
        });
      }
      by += uiDim(36);
    }
  }

  close() {
    if (!this.open) return;
    this.clear();
    this.open = false;
    this.onClose?.();
  }

  private clear() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.backdrop?.destroy();
    this.backdrop = undefined;
  }

  destroy() {
    this.close();
  }
}

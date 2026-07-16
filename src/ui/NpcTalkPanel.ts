// Compact multi-choice talk menu for NPCs (heal / tip / job…).
// Sized in design-space and clamped to the viewport so it never draws off-screen
// on mobile landscape or supersampled desktop backings.

import Phaser from "phaser";
import { dimBackdrop, fitModalRect, uiDim } from "./uiLayout";
import { bodyFont, displayFont } from "./typography";
import {
  NPC_SERVICES,
  npcRoleLabel,
  serviceIconKey,
  servicesForNpc,
  type NpcServiceId,
} from "../game/npcServices";
import { bountyForNpc } from "../game/bounties";
import { prefersMobileUx } from "../systems/Mobile";

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

    // Design-space sizing (NOT pre-uiDim'd — fitModalRect scales once).
    // Mobile: wider sheet, finger-tall rows, lower third so thumbs reach without
    // covering the NPC / combat. Desktop: compact centered card.
    const mobile = prefersMobileUx();
    const designW = mobile ? 340 : 340;
    const headerDesign = mobile ? 64 : 72;
    const rowDesign = mobile ? 44 : 36;
    const designH = headerDesign + options.length * rowDesign + (mobile ? 14 : 18);
    const D = 1740;
    const { x, y, w, h } = fitModalRect(designW, designH, {
      marginDesign: mobile ? 8 : 20,
      vAlign: mobile ? "lower" : "center",
    });
    this.backdrop = dimBackdrop(this.scene, D, 0.4, () => this.close(), { x, y, w, h });

    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const g = add(this.scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x080a12, 0.96).fillRoundedRect(x, y, w, h, uiDim(6));
    g.lineStyle(uiDim(1), 0x3a4560, 0.9).strokeRoundedRect(x, y, w, h, uiDim(6));

    const pad = uiDim(12);
    const role = npcRoleLabel(opts.npcId);
    add(
      this.scene.add
        .text(x + pad, y + uiDim(8), `${opts.name}`, displayFont(mobile ? 11 : 12, { color: "#c8d0dc", fontStyle: "bold" }))
        .setScrollFactor(0)
        .setDepth(D + 3),
    );
    add(
      this.scene.add
        .text(x + w - pad, y + uiDim(10), role, bodyFont(8, { color: "#5a6478" }))
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(D + 3),
    );

    const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
    const quote = add(
      this.scene.add
        .text(x + pad, y + uiDim(28), clip(opts.line, mobile ? 72 : 100), {
          fontFamily: "Courier New, monospace",
          fontSize: `${uiDim(mobile ? 9 : 10)}px`,
          color: "#8a94a8",
          wordWrap: { width: w - pad * 2 },
          fontStyle: "italic",
          lineSpacing: 2,
        })
        .setScrollFactor(0)
        .setDepth(D + 3),
    );
    // Cap quote height so buttons stay visible.
    const quoteMaxH = uiDim(32);
    if (quote.height > quoteMaxH) {
      quote.setText(clip(opts.line, mobile ? 48 : 70));
    }

    const btnStart = Math.max(y + uiDim(52), quote.y + Math.min(quote.height, quoteMaxH) + uiDim(6));
    const btnGap = uiDim(3);
    const btnW = w - pad * 2;
    const bottomLimit = y + h - uiDim(8);
    // Pack button height so every option fits inside the clamped card when possible.
    const n = Math.max(1, options.length);
    const availBtns = Math.max(uiDim(24), bottomLimit - btnStart);
    let btnH = Math.min(uiDim(mobile ? 42 : 32), Math.floor((availBtns - (n - 1) * btnGap) / n));
    btnH = Math.max(uiDim(mobile ? 36 : 22), btnH);
    let by = btnStart;

    for (let i = 0; i < options.length; i++) {
      if (by + btnH > bottomLimit + 1) break;
      const opt = options[i];
      const bx = x + pad;
      const muted = !!opt.disabled;
      const col = parseInt(opt.color.replace("#", ""), 16) || 0x9aa3b2;
      g.fillStyle(0x10141e, muted ? 0.4 : 0.9).fillRoundedRect(bx, by, btnW, btnH, uiDim(3));
      g.lineStyle(uiDim(1), col, muted ? 0.25 : 0.5).strokeRoundedRect(bx, by, btnW, btnH, uiDim(3));

      const twoLine = btnH >= uiDim(28);
      const iconKey = serviceIconKey(opt.id);
      const iconSize = Math.min(btnH - uiDim(6), uiDim(mobile ? 30 : 24));
      const hasIcon = this.scene.textures.exists(iconKey);
      if (hasIcon) {
        add(
          this.scene.add
            .image(bx + uiDim(5) + iconSize / 2, by + btnH / 2, iconKey)
            .setDisplaySize(iconSize, iconSize)
            .setAlpha(muted ? 0.28 : 0.9)
            .setScrollFactor(0)
            .setDepth(D + 4),
        );
      }
      const textX = bx + uiDim(hasIcon ? (mobile ? 42 : 35) : 8);
      const label = add(
        this.scene.add
          .text(
            textX,
            by + (twoLine ? uiDim(3) : btnH / 2),
            twoLine ? opt.label : `${opt.label} · ${clip(opt.disabledReason ?? opt.hint, 28)}`,
            bodyFont(mobile ? 10 : 11, {
              color: muted ? "#4a5160" : "#d0d6e0",
              fontStyle: "bold",
            }),
          )
          .setOrigin(0, twoLine ? 0 : 0.5)
          .setScrollFactor(0)
          .setDepth(D + 4),
      );
      if (twoLine) {
        add(
          this.scene.add
            .text(textX, by + uiDim(15), clip(opt.disabledReason ?? opt.hint, 42), bodyFont(7, {
              color: muted ? "#3a4050" : "#6a7488",
            }))
            .setScrollFactor(0)
            .setDepth(D + 4),
        );
      }

      if (!muted) {
        const zone = add(
          this.scene.add
            .zone(bx, by, btnW, btnH)
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
      by += btnH + btnGap;
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

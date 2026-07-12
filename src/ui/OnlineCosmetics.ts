import Phaser from "phaser";
import { COLORS } from "../config";
import { COSMETICS } from "../game/cosmetics";
import { METRO_MAINNET_ARMED } from "../economy/metro";
import { closeHint, dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";

export default class OnlineCosmetics {
  open = false;
  onAction?: (action: "buy" | "equip" | "unequip", id?: string) => void;
  private scene: Phaser.Scene;
  private owned: string[] = [];
  private equipped: string | null = null;
  private credits = 0;
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setState(owned: string[], equipped: string | null, credits: number) {
    this.owned = owned ?? [];
    this.equipped = equipped;
    this.credits = credits;
    if (this.open) this.build();
  }
  toggle(owned: string[], equipped: string | null, credits: number) {
    this.open = !this.open;
    this.owned = owned ?? [];
    this.equipped = equipped;
    this.credits = credits;
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
    const rowH = uiDim(58);
    const cardH = uiDim(50);
    const btnH = uiDim(26);
    const { x, y, w, h } = modalRect(740, 126 + COSMETICS.length * 58);

    add(dimBackdrop(scene, D, 0.64, () => this.close()));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), COLORS.neonMagenta, 0.85).strokeRect(x, y, w, h);

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
    const btn = (bx: number, by: number, bw: number, label: string, color: number, enabled: boolean, fn: () => void) => {
      g.fillStyle(enabled ? 0x161232 : 0x0e0c1c, 0.96).fillRect(bx, by, bw, btnH);
      g.lineStyle(uiDim(1.2), color, enabled ? 0.95 : 0.3).strokeRect(bx, by, bw, btnH);
      tx(label, bx + bw / 2, by + uiDim(7), 11, enabled ? "#cfe8ff" : "#4a5266", false, 0.5);
      if (enabled) {
        const z = add(
          scene.add.zone(bx, by, bw, btnH).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4),
        );
        z.on("pointerdown", fn);
      }
    };

    tx("✦ WARDROBE — TRANSMOG", x + uiDim(22), y + uiDim(16), 17, "#ff2bd6", true);
    tx(`₵ ${this.credits}`, x + w / 2, y + uiDim(18), 14, "#f7ff3c", true, 0.5);
    tx(`${closeHint("Y / ESC close")} · cosmetic only — no power`, x + w - uiDim(20), y + uiDim(18), 12, "#9aa3b2", false, 1);

    const chip = uiDim(26);
    const iconSize = uiDim(24);
    COSMETICS.forEach((c, i) => {
      const ry = y + uiDim(56) + i * rowH;
      const owns = this.owned.includes(c.id);
      const isEq = this.equipped === c.id;
      const locked = !!c.nft && !METRO_MAINNET_ARMED;
      g.fillStyle(isEq ? 0x231a3a : 0x12102a, 0.92).fillRect(x + uiDim(18), ry, w - uiDim(36), cardH);
      g.lineStyle(isEq ? uiDim(2) : uiDim(1.4), isEq ? 0x39ff88 : c.swatch, locked ? 0.4 : 1).strokeRect(x + uiDim(18), ry, w - uiDim(36), cardH);
      g.fillStyle(c.swatch, locked ? 0.18 : 0.35).fillRect(x + uiDim(28), ry + uiDim(12), chip, chip);
      g.lineStyle(uiDim(1), c.swatch, locked ? 0.4 : 0.9).strokeRect(x + uiDim(28), ry + uiDim(12), chip, chip);
      const cosKey = "cos_" + c.id;
      if (scene.textures.exists(cosKey)) {
        add(
          scene.add
            .image(x + uiDim(40), ry + uiDim(24), cosKey)
            .setDisplaySize(iconSize, iconSize)
            .setScrollFactor(0)
            .setDepth(D + 2)
            .setAlpha(locked ? 0.4 : 1),
        );
      }
      tx(`${isEq ? "✓ " : ""}${c.name}`, x + uiDim(66), ry + uiDim(10), 14, locked ? "#5a6172" : "#" + (c.swatch & 0xffffff).toString(16).padStart(6, "0"), true);
      tx(c.desc, x + uiDim(66), ry + uiDim(29), 11, locked ? "#4a5266" : "#9aa3b2");

      const bx = x + w - uiDim(18) - uiDim(136);
      if (locked) {
        tx("🔒 NFT — MAINNET", x + w - uiDim(26), ry + uiDim(19), 12, "#5a6172", false, 1);
      } else if (!owns) {
        btn(bx, ry + uiDim(12), uiDim(136), `BUY ₵${c.price}`, COLORS.neonGreen, this.credits >= c.price, () => this.onAction?.("buy", c.id));
      } else if (isEq) {
        btn(bx, ry + uiDim(12), uiDim(136), "UNEQUIP", COLORS.neonMagenta, true, () => this.onAction?.("unequip"));
      } else {
        btn(bx, ry + uiDim(12), uiDim(136), "EQUIP", COLORS.neonCyan, true, () => this.onAction?.("equip", c.id));
      }
    });
  }

  destroy() {
    this.clear();
  }
}
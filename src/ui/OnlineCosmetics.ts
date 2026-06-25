import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
import { COSMETICS } from "../game/cosmetics";
import { METRO_MAINNET_ARMED } from "../economy/metro";

// METROPHAGE wardrobe (key Y) — cosmetics / transmog. Skins override appearance with ZERO
// power effect; ownership is per identity (wallet account), server-authoritative. NFT-tier
// skins are locked until the $METRO mainnet bridge is armed (counsel). Equipping retints your
// avatar everywhere (the server relays the merged look). Buy with credits; equip/unequip free.

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
    const w = 720;
    const h = 120 + COSMETICS.length * 56;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    add(scene.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x02020a, 0.64).setScrollFactor(0).setDepth(D));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(2, COLORS.neonMagenta, 0.85).strokeRect(x, y, w, h);

    const tx = (s: string, fx: number, fy: number, size: number, color: string, bold = false, origin = 0) =>
      add(
        scene.add
          .text(fx, fy, s, { fontFamily: "Courier New, monospace", fontSize: size + "px", color, fontStyle: bold ? "bold" : "normal" })
          .setOrigin(origin, 0)
          .setScrollFactor(0)
          .setDepth(D + 3),
      );
    const btn = (bx: number, by: number, bw: number, label: string, color: number, enabled: boolean, fn: () => void) => {
      g.fillStyle(enabled ? 0x161232 : 0x0e0c1c, 0.96).fillRect(bx, by, bw, 24);
      g.lineStyle(1.2, color, enabled ? 0.95 : 0.3).strokeRect(bx, by, bw, 24);
      tx(label, bx + bw / 2, by + 6, 10, enabled ? "#cfe8ff" : "#4a5266", false, 0.5);
      if (enabled) {
        const z = add(scene.add.zone(bx, by, bw, 24).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4));
        z.on("pointerdown", fn);
      }
    };

    tx("✦ WARDROBE — TRANSMOG", x + 20, y + 14, 16, "#ff2bd6", true);
    tx(`₵ ${this.credits}`, x + w / 2, y + 16, 13, "#f7ff3c", true, 0.5);
    tx("Y / ESC close · cosmetic only — no power", x + w - 18, y + 16, 11, "#9aa3b2", false, 1);

    COSMETICS.forEach((c, i) => {
      const ry = y + 52 + i * 56;
      const owns = this.owned.includes(c.id);
      const isEq = this.equipped === c.id;
      const locked = !!c.nft && !METRO_MAINNET_ARMED;
      g.fillStyle(isEq ? 0x231a3a : 0x12102a, 0.92).fillRect(x + 16, ry, w - 32, 48);
      g.lineStyle(isEq ? 2 : 1.4, isEq ? 0x39ff88 : c.swatch, locked ? 0.4 : 1).strokeRect(x + 16, ry, w - 32, 48);
      // garment icon (real apparel art) on an accent-tinted chip; falls back to a swatch
      g.fillStyle(c.swatch, locked ? 0.18 : 0.35).fillRect(x + 26, ry + 12, 24, 24);
      g.lineStyle(1, c.swatch, locked ? 0.4 : 0.9).strokeRect(x + 26, ry + 12, 24, 24);
      const cosKey = "cos_" + c.id;
      if (scene.textures.exists(cosKey)) {
        add(scene.add.image(x + 38, ry + 24, cosKey).setDisplaySize(22, 22).setScrollFactor(0).setDepth(D + 2).setAlpha(locked ? 0.4 : 1));
      }
      tx(`${isEq ? "✓ " : ""}${c.name}`, x + 62, ry + 8, 13, locked ? "#5a6172" : "#" + (c.swatch & 0xffffff).toString(16).padStart(6, "0"), true);
      tx(c.desc, x + 62, ry + 27, 10, locked ? "#4a5266" : "#9aa3b2");

      const bx = x + w - 16 - 130;
      if (locked) {
        tx("🔒 NFT — MAINNET", x + w - 24, ry + 18, 11, "#5a6172", false, 1);
      } else if (!owns) {
        btn(bx, ry + 12, 130, `BUY ₵${c.price}`, COLORS.neonGreen, this.credits >= c.price, () => this.onAction?.("buy", c.id));
      } else if (isEq) {
        btn(bx, ry + 12, 130, "UNEQUIP", COLORS.neonMagenta, true, () => this.onAction?.("unequip"));
      } else {
        btn(bx, ry + 12, 130, "EQUIP", COLORS.neonCyan, true, () => this.onAction?.("equip", c.id));
      }
    });
  }

  destroy() {
    this.clear();
  }
}

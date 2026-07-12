import Phaser from "phaser";
import { COLORS } from "../config";
import { Item, Slot, RARITIES, SLOT_NAMES, itemStatLines } from "../game/items";
import { getWeapon } from "../game/weapons";
import { iconKey, ensureItemIcons } from "../assets/itemIcons";
import { upgradeCost, reforgeCost, salvageYield, fuseCost, canUpgrade, canFuse, UPGRADE_MAX } from "../game/crafting";
import Modal from "./Modal";
import { closeHint, dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";
import { fitTextToWidth, setFittedText } from "./typography";

const SLOT_ICON: Record<Slot, string> = { weapon: "WEAPON-MOD", implant: "IMPLANT", armor: "ARMOR", chip: "CHIP" };
function itemIcon(it: Item): { key: string; tint: number } {
  const w = it.weaponId ? getWeapon(it.weaponId) : undefined;
  if (w) return { key: iconKey(w.klass), tint: 0xffffff };
  return { key: iconKey(SLOT_ICON[it.slot]), tint: RARITIES[it.rarity].color };
}

type CraftAction = "upgrade" | "reforge" | "salvage" | "fuse";

export default class OnlineForge extends Modal {
  onCraft?: (action: CraftAction, itemId: string, itemId2?: string) => void;
  private items: Item[] = [];
  private equipped: Item[] = [];
  private credits = 0;
  private cores = 0;
  private fuseSel: string | null = null;
  private hdr?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene);
    ensureItemIcons(scene);
  }

  setState(items: Item[], equipped: Item[], credits: number, cores: number) {
    this.items = items ?? [];
    this.equipped = equipped ?? [];
    this.credits = credits;
    this.cores = cores;
    if (this.open) this.build();
  }

  setWallet(credits: number, cores: number) {
    this.credits = credits;
    this.cores = cores;
    if (this.hdr) setFittedText(this.hdr, `₵ ${credits}    ◈ ${cores}`, uiDim(260));
  }

  toggle() {
    this.toggleOpen();
  }
  close() {
    this.fuseSel = null; // fuse selection must not survive a dismissal
    super.close();
  }
  protected clear() {
    super.clear();
    this.hdr = undefined;
  }

  protected build() {
    this.clear();
    const scene = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const D = 1700;
    const rowH = uiDim(62);
    const rows = [...this.equipped.map((it) => ({ it, eq: true })), ...this.items.map((it) => ({ it, eq: false }))];
    const shown = rows.slice(0, 9);
    const { x, y, w, h } = modalRect(680, 100 + shown.length * 62);

    add(dimBackdrop(scene, D, 0.62, () => this.close(), { x, y, w, h }));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), COLORS.neonMagenta, 0.85).strokeRect(x, y, w, h);

    const tx = (s: string, fx: number, fy: number, size: number, color: string, bold = false, origin = 0, maxWidth?: number) => {
      const t = add(
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
      if (maxWidth !== undefined) fitTextToWidth(t, maxWidth);
      return t;
    };
    const btnH = uiDim(24);
    const btn = (bx: number, by: number, bw: number, label: string, color: number, enabled: boolean, fn: () => void) => {
      g.fillStyle(enabled ? 0x161232 : 0x0e0c1c, 0.95).fillRect(bx, by, bw, btnH);
      g.lineStyle(uiDim(1.2), color, enabled ? 0.95 : 0.3).strokeRect(bx, by, bw, btnH);
      tx(label, bx + bw / 2, by + uiDim(6), 11, enabled ? "#cfe8ff" : "#4a5266", false, 0.5, bw - uiDim(8));
      if (enabled) {
        const z = add(
          scene.add.zone(bx, by, bw, btnH).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4),
        );
        z.on("pointerdown", fn);
      }
    };

    tx("⚒ GEAR FORGE", x + uiDim(20), y + uiDim(14), 17, "#ff2bd6", true);
    this.hdr = tx(`₵ ${this.credits}    ◈ ${this.cores}`, x + w - uiDim(20), y + uiDim(16), 15, "#f7ff3c", true, 1, w - uiDim(230));
    tx(
      this.fuseSel ? "FUSE: pick a second item of the same rarity (✦)" : `▲ upgrade · ↻ reforge · ✂ salvage · ✦ fuse · ${closeHint("G/ESC close")}`,
      x + uiDim(20),
      y + uiDim(40),
      12,
      this.fuseSel ? "#39ff88" : "#9aa3b2",
      false,
      0,
      w - uiDim(40),
    );

    if (shown.length === 0) tx("nothing to forge — loot or buy gear first", x + w / 2, y + h / 2, 13, "#5a6172", false, 0.5);

    const cardH = uiDim(56);
    const bw = uiDim(96);
    const gap = uiDim(6);
    const iconSize = uiDim(32);

    shown.forEach(({ it, eq }, i) => {
      const ry = y + uiDim(60) + i * rowH;
      const r = RARITIES[it.rarity];
      const selected = this.fuseSel === it.id;
      g.fillStyle(selected ? 0x231a3a : 0x12102a, 0.92).fillRect(x + uiDim(18), ry, w - uiDim(36), cardH);
      g.lineStyle(selected ? uiDim(2) : uiDim(1.4), selected ? 0x39ff88 : r.color, 1).strokeRect(x + uiDim(18), ry, w - uiDim(36), cardH);
      const ic = itemIcon(it);
      add(scene.add.image(x + uiDim(42), ry + cardH / 2, ic.key).setDisplaySize(iconSize, iconSize).setTint(ic.tint).setScrollFactor(0).setDepth(D + 2));
      const lvl = it.ilvl ?? 0;
      const leftTextX = x + uiDim(66);
      const buttonLeftX = eq ? x + w - uiDim(18) - bw : x + w - uiDim(18) - bw * 2 - gap;
      const rowTextW = buttonLeftX - leftTextX - uiDim(8);
      tx(`${it.name}${lvl ? ` +${lvl}` : ""}${eq ? "  [E]" : ""}`, leftTextX, ry + uiDim(8), 13, r.hex, true, 0, rowTextW);
      tx(itemStatLines(it).filter((l) => !l.startsWith("◈")).join("  ") || "—", leftTextX, ry + uiDim(26), 10, "#9aa3b2", false, 0, rowTextW);
      tx(`${r.name} · ${SLOT_NAMES[it.slot]}`, leftTextX, ry + uiDim(40), 10, "#5a6172", false, 0, rowTextW);

      let bx = x + w - uiDim(18) - bw;
      const by = ry + uiDim(8);
      const by2 = ry + uiDim(32);
      const uc = upgradeCost(it);
      const canU = canUpgrade(it);
      btn(bx, by, bw, canU ? `▲+1 ₵${uc.credits} ◈${uc.cores}` : `MAX +${UPGRADE_MAX}`, 0x39ff88, canU && this.credits >= uc.credits && this.cores >= uc.cores, () =>
        this.onCraft?.("upgrade", it.id),
      );
      const rc = reforgeCost(it);
      btn(bx, by2, bw, `↻ ₵${rc.credits} ◈${rc.cores}`, 0x29e7ff, this.credits >= rc.credits && this.cores >= rc.cores, () => this.onCraft?.("reforge", it.id));
      if (!eq) {
        bx -= bw + gap;
        const sy = salvageYield(it);
        btn(bx, by, bw, `✂ +◈${sy.cores} ₵${sy.credits}`, 0xff7a3c, true, () => this.onCraft?.("salvage", it.id));
        const fc = fuseCost(it);
        const fuseLabel = selected ? "✦ SELECTED" : `✦ ₵${fc.credits} ◈${fc.cores}`;
        btn(bx, by2, bw, fuseLabel, 0xff2bd6, true, () => this.pickFuse(it));
      }
    });
  }

  private pickFuse(it: Item) {
    if (!this.fuseSel) {
      this.fuseSel = it.id;
      this.build();
      return;
    }
    if (this.fuseSel === it.id) {
      this.fuseSel = null;
      this.build();
      return;
    }
    const a = this.items.find((x) => x.id === this.fuseSel);
    if (a && canFuse(a, it)) {
      this.onCraft?.("fuse", this.fuseSel, it.id);
      this.fuseSel = null;
    } else {
      this.scene.events.emit("forge-msg");
      this.fuseSel = it.id;
      this.build();
    }
  }

}

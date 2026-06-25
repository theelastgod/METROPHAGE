import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
import { Item, Slot, RARITIES, SLOT_NAMES, itemStatLines } from "../game/items";
import { getWeapon } from "../game/weapons";
import { iconKey, ensureItemIcons } from "../assets/itemIcons";
import { upgradeCost, reforgeCost, salvageYield, fuseCost, canUpgrade, canFuse, UPGRADE_MAX } from "../game/crafting";

// METROPHAGE gear forge (key G) — the credits+cores sink that deepens loot→equip. Lists
// your loadout + bag and fires server-authoritative craft requests (the server validates
// + deducts + mutates; this panel only previews costs and sends intent). FUSE: click ✦ on
// one bag item, then ✦ on another of the same rarity to merge them up a tier.

const SLOT_ICON: Record<Slot, string> = { weapon: "WEAPON-MOD", implant: "IMPLANT", armor: "ARMOR", chip: "CHIP" };
function itemIcon(it: Item): { key: string; tint: number } {
  const w = it.weaponId ? getWeapon(it.weaponId) : undefined;
  // weapons = full-colour gun art (untinted); gear/consumables = monochrome glyphs, rarity-tinted
  if (w) return { key: iconKey(w.klass), tint: 0xffffff };
  return { key: iconKey(SLOT_ICON[it.slot]), tint: RARITIES[it.rarity].color };
}

type CraftAction = "upgrade" | "reforge" | "salvage" | "fuse";

export default class OnlineForge {
  open = false;
  onCraft?: (action: CraftAction, itemId: string, itemId2?: string) => void;
  private scene: Phaser.Scene;
  private items: Item[] = [];
  private equipped: Item[] = [];
  private credits = 0;
  private cores = 0;
  private fuseSel: string | null = null; // first-picked fuse item id
  private objs: Phaser.GameObjects.GameObject[] = [];
  private hdr?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    ensureItemIcons(scene);
  }

  setState(items: Item[], equipped: Item[], credits: number, cores: number) {
    this.items = items ?? [];
    this.equipped = equipped ?? [];
    this.credits = credits;
    this.cores = cores;
    if (this.open) this.build();
  }
  /** Cheap per-frame header refresh (credits/cores) without rebuilding the whole panel. */
  setWallet(credits: number, cores: number) {
    this.credits = credits;
    this.cores = cores;
    this.hdr?.setText(`₵ ${credits}    ◈ ${cores}`);
  }

  toggle() {
    this.open = !this.open;
    if (this.open) this.build();
    else this.clear();
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.fuseSel = null;
    this.clear();
  }
  private clear() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.hdr = undefined;
  }

  private build() {
    this.clear();
    const scene = this.scene;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      return o;
    };
    const D = 1700;
    const w = 660;
    const rows = [...this.equipped.map((it) => ({ it, eq: true })), ...this.items.map((it) => ({ it, eq: false }))];
    const shown = rows.slice(0, 9);
    const h = 96 + shown.length * 60;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;

    add(scene.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x02020a, 0.62).setScrollFactor(0).setDepth(D));
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
    // labeled button: rect + glyph; affordable→bright, broke→dim+inert
    const btn = (bx: number, by: number, bw: number, label: string, color: number, enabled: boolean, fn: () => void) => {
      g.fillStyle(enabled ? 0x161232 : 0x0e0c1c, 0.95).fillRect(bx, by, bw, 22);
      g.lineStyle(1.2, color, enabled ? 0.95 : 0.3).strokeRect(bx, by, bw, 22);
      tx(label, bx + bw / 2, by + 5, 10, enabled ? "#cfe8ff" : "#4a5266", false, 0.5);
      if (enabled) {
        const z = add(scene.add.zone(bx, by, bw, 22).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4));
        z.on("pointerdown", fn);
      }
    };

    tx("⚒ GEAR FORGE", x + 18, y + 12, 16, "#ff2bd6", true);
    this.hdr = tx(`₵ ${this.credits}    ◈ ${this.cores}`, x + w - 18, y + 14, 14, "#f7ff3c", true, 1);
    tx(
      this.fuseSel ? "FUSE: pick a second item of the same rarity (✦)" : "▲ upgrade · ↻ reforge · ✂ salvage · ✦ fuse · G/ESC close",
      x + 18,
      y + 36,
      11,
      this.fuseSel ? "#39ff88" : "#9aa3b2",
    );

    if (shown.length === 0) tx("nothing to forge — loot or buy gear first", VIEW_W / 2, y + h / 2, 12, "#5a6172", false, 0.5);

    shown.forEach(({ it, eq }, i) => {
      const ry = y + 56 + i * 60;
      const r = RARITIES[it.rarity];
      const selected = this.fuseSel === it.id;
      g.fillStyle(selected ? 0x231a3a : 0x12102a, 0.92).fillRect(x + 16, ry, w - 32, 54);
      g.lineStyle(selected ? 2 : 1.4, selected ? 0x39ff88 : r.color, 1).strokeRect(x + 16, ry, w - 32, 54);
      const ic = itemIcon(it);
      add(scene.add.image(x + 40, ry + 27, ic.key).setDisplaySize(30, 30).setTint(ic.tint).setScrollFactor(0).setDepth(D + 2));
      const lvl = it.ilvl ?? 0;
      tx(`${it.name}${lvl ? ` +${lvl}` : ""}${eq ? "  [E]" : ""}`, x + 62, ry + 6, 12, r.hex, true);
      tx(itemStatLines(it).filter((l) => !l.startsWith("◈")).join("  ") || "—", x + 62, ry + 24, 9, "#9aa3b2");
      tx(`${r.name} · ${SLOT_NAMES[it.slot]}`, x + 62, ry + 38, 9, "#5a6172");

      // action buttons, right-aligned
      const bw = 92;
      const gap = 6;
      let bx = x + w - 16 - bw;
      const by = ry + 6;
      const by2 = ry + 30;
      // UPGRADE
      const uc = upgradeCost(it);
      const canU = canUpgrade(it);
      btn(bx, by, bw, canU ? `▲+1 ₵${uc.credits} ◈${uc.cores}` : `MAX +${UPGRADE_MAX}`, 0x39ff88, canU && this.credits >= uc.credits && this.cores >= uc.cores, () =>
        this.onCraft?.("upgrade", it.id),
      );
      // REFORGE
      const rc = reforgeCost(it);
      btn(bx, by2, bw, `↻ ₵${rc.credits} ◈${rc.cores}`, 0x29e7ff, this.credits >= rc.credits && this.cores >= rc.cores, () => this.onCraft?.("reforge", it.id));
      // bag-only: salvage + fuse
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

  /** Fuse selection: first ✦ arms it; a second valid ✦ fires the fuse. */
  private pickFuse(it: Item) {
    if (!this.fuseSel) {
      this.fuseSel = it.id;
      this.build();
      return;
    }
    if (this.fuseSel === it.id) {
      this.fuseSel = null; // toggle off
      this.build();
      return;
    }
    const a = this.items.find((x) => x.id === this.fuseSel);
    if (a && canFuse(a, it)) {
      this.onCraft?.("fuse", this.fuseSel, it.id);
      this.fuseSel = null;
    } else {
      this.scene.events.emit("forge-msg"); // (no-op hook) — keep selection, let user retry
      this.fuseSel = it.id; // re-arm with the latest pick
      this.build();
    }
  }

  destroy() {
    this.clear();
  }
}

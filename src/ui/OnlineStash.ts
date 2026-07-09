import Phaser from "phaser";
import { Item, RARITIES } from "../game/items";
import { dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";

/** Both sides are capped server-side; mirrored here for the header counts. */
const CAP = 24;

const hexStr = (n: number) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");

/**
 * TENEMENT lockbox — personal stash. Two clickable columns: click a stashed item to
 * take it, click a bag item to stash it. The server owns the move (venue gate, caps,
 * ownership); this panel just renders NetClient state and emits intents.
 */
export default class OnlineStash {
  open = false;
  onDeposit?: (itemId: string) => void;
  onWithdraw?: (itemId: string) => void;
  private scene: Phaser.Scene;
  private stash: Item[] = [];
  private bag: Item[] = [];
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  toggle(stash: Item[], bag: Item[]) {
    this.open = !this.open;
    if (this.open) this.refresh(stash, bag);
    else this.clear();
  }

  /** Re-render with fresh server state (no-op when closed). */
  refresh(stash: Item[], bag: Item[]) {
    this.stash = stash;
    this.bag = bag;
    if (this.open) this.build();
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
    // design space is 960×540 — the old 940×600 hung off the bottom of the screen
    const { x, y, w, h } = modalRect(820, 480);
    const rowH = uiDim(21);

    add(dimBackdrop(scene, D, 0.66));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), 0xffb13c, 0.85).strokeRect(x, y, w, h);

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

    tx("▣ LOCKBOX — PERSONAL STASH", x + uiDim(22), y + uiDim(16), 17, "#ffb13c", true);
    tx("ESC close", x + w - uiDim(20), y + uiDim(18), 12, "#9aa3b2", false, 1);
    tx("safe from death · click a stashed item to take it · click a bag item to stash it", x + uiDim(22), y + uiDim(42), 11, "#9aa3b2");

    const colMid = x + w * 0.5;
    g.lineStyle(uiDim(1), 0x2a2440, 0.9).lineBetween(colMid, y + uiDim(66), colMid, y + h - uiDim(18));

    const column = (
      title: string,
      items: Item[],
      cx: number,
      cw: number,
      emptyLine: string,
      onPick: (it: Item) => void,
    ) => {
      tx(`${title}  ${items.length}/${CAP}`, cx, y + uiDim(66), 13, "#f7ff3c", true);
      let ry = y + uiDim(88);
      if (items.length === 0) tx(emptyLine, cx, ry + uiDim(4), 11, "#5a6172");
      let shown = 0;
      for (const it of items) {
        if (ry + rowH > y + h - uiDim(30)) break; // leave room for the "+N more" footer
        const col = hexStr(RARITIES[it.rarity].color);
        g.fillStyle(0x12102a, 0.9).fillRect(cx, ry, cw, rowH - uiDim(3));
        g.lineStyle(uiDim(1), RARITIES[it.rarity].color, 0.55).strokeRect(cx, ry, cw, rowH - uiDim(3));
        tx(`${it.name}${(it.ilvl ?? 0) > 0 ? ` +${it.ilvl}` : ""}`, cx + uiDim(8), ry + uiDim(3), 10, col, true);
        tx(it.slot.toUpperCase(), cx + cw - uiDim(8), ry + uiDim(4), 8, "#6b7184", false, 1);
        const z = add(
          scene.add.zone(cx, ry, cw, rowH - uiDim(3)).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4),
        );
        z.on("pointerdown", () => onPick(it));
        ry += rowH;
        shown++;
      }
      if (shown < items.length) tx(`+${items.length - shown} more…`, cx, ry + uiDim(2), 10, "#6b7184");
    };

    column("STASH", this.stash, x + uiDim(22), w * 0.5 - uiDim(40), "nothing stashed yet", (it) => this.onWithdraw?.(it.id));
    column("BAG", this.bag, colMid + uiDim(18), w * 0.5 - uiDim(40), "your bag is empty", (it) => this.onDeposit?.(it.id));
  }
}

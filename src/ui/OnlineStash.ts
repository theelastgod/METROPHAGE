import Phaser from "phaser";
import { Item, RARITIES } from "../game/items";
import { closeHint, dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";
import { fitTextToWidth } from "./typography";

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
  private stashPage = 0;
  private bagPage = 0;

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

    add(dimBackdrop(scene, D, 0.66, () => this.close()));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x0a0818, 0.97).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), 0xffb13c, 0.85).strokeRect(x, y, w, h);

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

    tx("▣ LOCKBOX — PERSONAL STASH", x + uiDim(22), y + uiDim(16), 17, "#ffb13c", true);
    tx(closeHint("ESC close"), x + w - uiDim(20), y + uiDim(18), 12, "#9aa3b2", false, 1);
    tx("safe from death · click a stashed item to take it · click a bag item to stash it", x + uiDim(22), y + uiDim(42), 11, "#9aa3b2", false, 0, w - uiDim(44));

    const colMid = x + w * 0.5;
    g.lineStyle(uiDim(1), 0x2a2440, 0.9).lineBetween(colMid, y + uiDim(66), colMid, y + h - uiDim(18));

    // How many rows fit one column — used to paginate so nothing gets stranded past the fold.
    const listTop = y + uiDim(88);
    const listBottom = y + h - uiDim(30);
    const perCol = Math.max(1, Math.floor((listBottom - listTop) / rowH));

    const column = (
      title: string,
      items: Item[],
      page: number,
      setPage: (p: number) => void,
      cx: number,
      cw: number,
      emptyLine: string,
      onPick: (it: Item) => void,
    ) => {
      const pageCount = Math.max(1, Math.ceil(items.length / perCol));
      const p = Math.min(Math.max(0, page), pageCount - 1);
      if (p !== page) setPage(p);
      tx(`${title}  ${items.length}/${CAP}`, cx, y + uiDim(66), 13, "#f7ff3c", true);
      // ◀ X/Y ▶ pager at the column's right edge (only when it overflows one page)
      if (pageCount > 1) {
        const py = y + uiDim(68);
        const rightX = cx + cw;
        const pager = (label: string, ax: number, enabled: boolean, delta: number) => {
          tx(label, ax, py, 13, enabled ? "#8dfff0" : "#3a3350", true, 0.5);
          if (enabled) {
            const z = add(scene.add.zone(ax - uiDim(10), py - uiDim(2), uiDim(20), uiDim(20)).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4));
            z.on("pointerdown", () => {
              setPage(p + delta);
              this.build();
            });
          }
        };
        pager("▶", rightX, p < pageCount - 1, 1);
        tx(`${p + 1}/${pageCount}`, rightX - uiDim(20), py, 10, "#9aa3b2", false, 1);
        pager("◀", rightX - uiDim(52), p > 0, -1);
      }
      let ry = listTop;
      if (items.length === 0) tx(emptyLine, cx, ry + uiDim(4), 11, "#5a6172");
      for (const it of items.slice(p * perCol, p * perCol + perCol)) {
        const col = hexStr(RARITIES[it.rarity].color);
        g.fillStyle(0x12102a, 0.9).fillRect(cx, ry, cw, rowH - uiDim(3));
        g.lineStyle(uiDim(1), RARITIES[it.rarity].color, 0.55).strokeRect(cx, ry, cw, rowH - uiDim(3));
        tx(`${it.name}${(it.ilvl ?? 0) > 0 ? ` +${it.ilvl}` : ""}`, cx + uiDim(8), ry + uiDim(3), 10, col, true, 0, cw - uiDim(74));
        tx(it.slot.toUpperCase(), cx + cw - uiDim(8), ry + uiDim(4), 8, "#6b7184", false, 1);
        const z = add(
          scene.add.zone(cx, ry, cw, rowH - uiDim(3)).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(D + 4),
        );
        z.on("pointerdown", () => onPick(it));
        ry += rowH;
      }
    };

    column("STASH", this.stash, this.stashPage, (p) => (this.stashPage = p), x + uiDim(22), w * 0.5 - uiDim(40), "nothing stashed yet", (it) => this.onWithdraw?.(it.id));
    column("BAG", this.bag, this.bagPage, (p) => (this.bagPage = p), colMid + uiDim(18), w * 0.5 - uiDim(40), "your bag is empty", (it) => this.onDeposit?.(it.id));
  }
}

// METROPHAGE — Memory journal / codex. Shows recovered ICE fragments + campaign notes.

import Phaser from "phaser";
import { FRAGMENTS, type FragmentDef } from "../game/fragments";
import Modal from "./Modal";
import { closeHint, dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";

export default class OnlineJournal extends Modal {
  private owned = new Set<string>();
  private selected = 0;

  setOwned(ids: string[]) {
    this.owned = new Set(ids);
    if (this.open) this.build();
  }

  toggle(ids: string[]) {
    this.owned = new Set(ids);
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
    const { x, y, w, h } = modalRect(760, 460);

    add(dimBackdrop(scene, D, 0.7, () => this.close(), { x, y, w, h }));
    const g = add(scene.add.graphics().setScrollFactor(0).setDepth(D + 1));
    g.fillStyle(0x08061a, 0.97).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), 0xb06bff, 0.9).strokeRect(x, y, w, h);

    const tx = (s: string, fx: number, fy: number, size: number, color: string, bold = false, origin = 0) =>
      add(
        scene.add
          .text(fx, fy, s, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(size),
            color,
            fontStyle: bold ? "bold" : "normal",
            wordWrap: { width: w * 0.52 },
          })
          .setOrigin(origin, 0)
          .setScrollFactor(0)
          .setDepth(D + 3),
      );

    tx("◈ MEMORY LOG", x + uiDim(22), y + uiDim(16), 18, "#b06bff", true);
    tx(closeHint("M / ESC"), x + w - uiDim(18), y + uiDim(18), 11, "#9aa3b2", false, 1);
    tx(`${this.owned.size}/${FRAGMENTS.length} fragments recovered`, x + uiDim(22), y + uiDim(42), 11, "#9aa3b2");

    const list = FRAGMENTS;
    if (this.selected >= list.length) this.selected = 0;
    const colW = w * 0.38;
    let ly = y + uiDim(68);
    list.forEach((f, i) => {
      const got = this.owned.has(f.id);
      const sel = i === this.selected;
      const rowH = uiDim(28);
      g.fillStyle(sel ? 0x1a1230 : 0x0e0c1c, 0.95).fillRect(x + uiDim(16), ly, colW, rowH);
      g.lineStyle(1, sel ? 0xb06bff : got ? 0x39ff88 : 0x2a2440, 0.85).strokeRect(x + uiDim(16), ly, colW, rowH);
      tx(`${got ? "◆" : "◇"} ${got ? f.title : "████████"}`, x + uiDim(24), ly + uiDim(6), 11, got ? (sel ? "#eafdff" : "#9dffc0") : "#4a4558", true);
      const hit = add(
        scene.add
          .zone(x + uiDim(16) + colW / 2, ly + rowH / 2, colW, rowH)
          .setScrollFactor(0)
          .setDepth(D + 5)
          .setInteractive({ useHandCursor: true }),
      );
      hit.on("pointerdown", () => {
        this.selected = i;
        this.build();
      });
      ly += rowH + uiDim(4);
    });

    const frag: FragmentDef = list[this.selected];
    const got = this.owned.has(frag.id);
    const rx = x + colW + uiDim(36);
    tx(got ? frag.title : "LOCKED MEMORY", rx, y + uiDim(68), 15, got ? "#f7ff3c" : "#5a5470", true);
    if (got) {
      let fy = y + uiDim(100);
      for (const line of frag.lines) {
        tx(line, rx, fy, 12, "#c8c0e0");
        fy += uiDim(36);
      }
    } else {
      tx("Recover this fragment at an ICE vault core (dive a district).", rx, y + uiDim(110), 12, "#7a7390");
      tx("THE FIXER points the way. Deploy · secure · dive.", rx, y + uiDim(150), 12, "#7a7390");
    }
  }
}

// METROPHAGE — Memory journal / codex. Shows recovered ICE fragments + campaign notes.

import Phaser from "phaser";
import { FRAGMENTS, memoryInterpretations, normalizeFragmentSequence, type FragmentDef } from "../game/fragments";
import Modal from "./Modal";
import { closeHint, dimBackdrop, modalRect, uiDim, uiFont } from "./uiLayout";

export default class OnlineJournal extends Modal {
  private owned = new Set<string>();
  private sequence: string[] = [];
  private selected = 0;
  private page = 0;

  setOwned(ids: string[]) {
    this.sequence = normalizeFragmentSequence(ids);
    this.owned = new Set(this.sequence);
    if (this.open) this.build();
  }

  toggle(ids: string[]) {
    this.sequence = normalizeFragmentSequence(ids);
    this.owned = new Set(this.sequence);
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
    const syntheses = memoryInterpretations(this.sequence);
    tx(`${this.owned.size}/${FRAGMENTS.length} fragments · ${syntheses.length}/8 syntheses`, x + uiDim(22), y + uiDim(42), 11, "#9aa3b2");

    const pageSize = 10;
    const pages = Math.ceil(FRAGMENTS.length / pageSize);
    if (this.selected >= FRAGMENTS.length) this.selected = 0;
    this.page = Math.max(0, Math.min(pages - 1, this.page));
    if (this.selected < this.page * pageSize || this.selected >= (this.page + 1) * pageSize) this.page = Math.floor(this.selected / pageSize);
    const list = FRAGMENTS.slice(this.page * pageSize, (this.page + 1) * pageSize);
    const colW = w * 0.38;
    let ly = y + uiDim(68);
    list.forEach((f, i) => {
      const absolute = this.page * pageSize + i;
      const got = this.owned.has(f.id);
      const sel = absolute === this.selected;
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
        this.selected = absolute;
        this.build();
      });
      ly += rowH + uiDim(4);
    });

    const pageY = y + h - uiDim(36);
    tx(`PAGE ${this.page + 1}/${pages}`, x + uiDim(24), pageY + uiDim(6), 10, "#81789a", true);
    const pageButton = (label: string, bx: number, next: number) => {
      const enabled = next >= 0 && next < pages;
      tx(label, bx, pageY + uiDim(4), 12, enabled ? "#b06bff" : "#393447", true);
      if (!enabled) return;
      const hit = add(scene.add.zone(bx + uiDim(12), pageY + uiDim(10), uiDim(32), uiDim(24)).setScrollFactor(0).setDepth(D + 5).setInteractive({ useHandCursor: true }));
      hit.on("pointerdown", () => {
        this.page = next;
        this.selected = next * pageSize;
        this.build();
      });
    };
    pageButton("‹", x + colW - uiDim(28), this.page - 1);
    pageButton("›", x + colW + uiDim(2), this.page + 1);

    const frag: FragmentDef = FRAGMENTS[this.selected];
    const got = this.owned.has(frag.id);
    const rx = x + colW + uiDim(36);
    tx(got ? frag.title : "LOCKED MEMORY", rx, y + uiDim(68), 15, got ? "#f7ff3c" : "#5a5470", true);
    if (got) {
      const sequenceAt = this.sequence.indexOf(frag.id) + 1;
      tx(`RECOVERY #${sequenceAt}`, rx, y + uiDim(88), 9, "#81789a", true);
      let fy = y + uiDim(100);
      for (const line of frag.lines) {
        tx(line, rx, fy, 12, "#c8c0e0");
        fy += uiDim(36);
      }
      const related = syntheses.filter((i) => i.requires.includes(frag.id)).slice(0, 2);
      if (related.length) {
        fy += uiDim(5);
        tx("▤ SYNTHESIS", rx, fy, 10, "#b06bff", true);
        fy += uiDim(20);
        for (const interpretation of related) {
          tx(`${interpretation.title} [${interpretation.positions.join("→")}]`, rx, fy, 10, "#f7ff3c", true);
          fy += uiDim(18);
          tx(interpretation.line, rx, fy, 10, "#aaa2c4");
          fy += uiDim(66);
        }
      }
    } else {
      tx("Recover this fragment at an ICE vault core (dive a district).", rx, y + uiDim(110), 12, "#7a7390");
      tx("THE FIXER points the way. Deploy · secure · dive.", rx, y + uiDim(150), 12, "#7a7390");
    }
  }
}

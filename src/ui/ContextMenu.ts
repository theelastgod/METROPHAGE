import Phaser from "phaser";
import { bodyFont, fitTextToWidth } from "./typography";
import { uiDim } from "./uiLayout";

export interface ContextAction {
  label: string;
  color?: string;
  onPick: () => void;
}

/**
 * Classic RuneScape right-click menu — yellow options on a dark framed panel.
 */
export default class ContextMenu {
  private scene: Phaser.Scene;
  private g: Phaser.GameObjects.Graphics;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private open = false;
  private bounds = { x: 0, y: 0, w: 0, h: 0 };
  private title = "";
  private actions: ContextAction[] = [];
  private hoverIdx = -1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(2100).setVisible(false);
  }

  isOpen() {
    return this.open;
  }

  show(screenX: number, screenY: number, title: string, actions: ContextAction[]) {
    this.hide();
    if (actions.length === 0) return;
    this.open = true;
    this.title = title;
    this.actions = actions;
    this.hoverIdx = -1;
    this.g.setVisible(true);

    const rowH = uiDim(22);
    const pad = uiDim(8);
    const w = uiDim(210);
    const h = pad * 2 + uiDim(18) + actions.length * rowH;
    let x = screenX;
    let y = screenY;
    const sw = this.scene.scale.width;
    const sh = this.scene.scale.height;
    if (x + w > sw - uiDim(8)) x = sw - w - uiDim(8);
    if (y + h > sh - uiDim(8)) y = sh - h - uiDim(8);
    this.bounds = { x, y, w, h };
    this.paint();
    this.mountZones(rowH, pad);
  }

  private paint() {
    const { x, y, w, h } = this.bounds;
    const rowH = uiDim(22);
    const pad = uiDim(8);
    const g = this.g;
    g.clear();
    g.fillStyle(0x3d3520, 0.96).fillRoundedRect(x, y, w, h, 3);
    g.lineStyle(2, 0x5a5038, 1).strokeRoundedRect(x, y, w, h, 3);
    g.fillStyle(0x2a2418, 0.9).fillRect(x + uiDim(4), y + uiDim(4), w - uiDim(8), uiDim(16));

    let ay = y + pad + uiDim(20);
    for (let i = 0; i < this.actions.length; i++) {
      if (i === this.hoverIdx) g.fillStyle(0x4a4028, 0.85).fillRect(x + pad, ay, w - pad * 2, rowH);
      ay += rowH;
    }
  }

  private mountZones(rowH: number, pad: number) {
    const { x, y, w } = this.bounds;
    const titleT = this.scene.add
      .text(x + pad, y + pad, this.title, bodyFont(11, { color: "#f7ff3c", fontStyle: "bold" }))
      .setScrollFactor(0)
      .setDepth(2101);
    fitTextToWidth(titleT, w - pad * 2);
    this.objs.push(titleT);

    let ay = y + pad + uiDim(20);
    for (let i = 0; i < this.actions.length; i++) {
      const act = this.actions[i];
      const prefix = this.actions.length > 1 ? `${i + 1} ` : "";
      const label = this.scene.add
        .text(x + pad + uiDim(4), ay + uiDim(3), `${prefix}${act.label}`, bodyFont(11, { color: act.color ?? "#ffff00" }))
        .setScrollFactor(0)
        .setDepth(2101);
      fitTextToWidth(label, w - pad * 2 - uiDim(8));
      this.objs.push(label);
      const zone = this.scene.add
        .zone(x + pad, ay, w - pad * 2, rowH)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .setDepth(2102);
      const idx = i;
      zone.on("pointerover", () => {
        this.hoverIdx = idx;
        this.paint();
      });
      zone.on("pointerout", () => {
        this.hoverIdx = -1;
        this.paint();
      });
      zone.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation();
        this.hide();
        act.onPick();
      });
      this.objs.push(zone);
      ay += rowH;
    }
  }

  hide() {
    this.open = false;
    this.hoverIdx = -1;
    this.g.clear().setVisible(false);
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }

  destroy() {
    this.hide();
    this.g.destroy();
  }
}

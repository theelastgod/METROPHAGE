import Phaser from "phaser";
import { VIEW_W, VIEW_H } from "../config";
import { EXOTIC_WEAPONS } from "../game/weapons";
import { fmtMetro, metroUsdLabel } from "../economy/metro";
import { drawPanelFrame } from "./panelChrome";

/** What the host scene must provide — the panel never touches the save/inventory itself. */
export interface BlackMarketHooks {
  getMetro: () => number;
  /** Try to buy `weaponId`; the host deducts $METRO + drops the weapon in the bag. */
  buy: (weaponId: string) => "ok" | "poor" | "full" | "nochar";
}

const MAGENTA = "#ff2bd6";
const GOLD = "#f7ff3c";

/**
 * THE BLACK MARKET — a premium arms dealer that sells exotic weapons (a clear tier above
 * the standard arsenal) for $METRO. Overlay panel: click a weapon to buy. Decoupled from
 * the scene via {@link BlackMarketHooks} so the city hub can run it against the save.
 */
export default class BlackMarketPanel {
  private scene: Phaser.Scene;
  private hooks: BlackMarketHooks;
  private g: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private header!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private rowTitle: Phaser.GameObjects.Text[] = [];
  private rowDesc: Phaser.GameObjects.Text[] = [];
  private open = false;

  private readonly x = 70;
  private readonly y = 40;
  private readonly w = VIEW_W - 140;
  private readonly h = VIEW_H - 80;

  constructor(scene: Phaser.Scene, hooks: BlackMarketHooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;

    this.header = this.text(this.x + 16, this.y + 12, "", "#eafdff", "14px", D);
    this.text(
      this.x + 16,
      this.y + 36,
      "EXOTIC ARMS · paid in $METRO · pump.fun token · 1B fixed supply · launch ≈ $4.2K mcap",
      "#9aa3b2",
      "10px",
      D,
    );

    const rowH = (this.h - 110) / EXOTIC_WEAPONS.length;
    EXOTIC_WEAPONS.forEach((_, i) => {
      const ry = this.rowY(i, rowH);
      this.rowTitle.push(this.text(this.x + 22, ry, "", MAGENTA, "13px", D + 1));
      this.rowDesc.push(this.text(this.x + 22, ry + 18, "", "#9aa3b2", "10px", D + 1));
      const z = scene.add
        .zone(this.x + 14, ry - 4, this.w - 28, rowH - 6)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      z.on("pointerover", () => this.rowTitle[i].setColor("#ffffff"));
      z.on("pointerout", () => this.rowTitle[i].setColor(MAGENTA));
      z.on("pointerdown", () => this.buy(i));
      this.zones.push(z);
    });

    this.status = this.text(this.x + 16, this.y + this.h - 40, "", GOLD, "11px", D + 1);
    this.text(this.x + this.w - 132, this.y + this.h - 40, "B / E / ESC to close", "#9aa3b2", "10px", D);

    this.setVisible(false);
  }

  get isOpen(): boolean {
    return this.open;
  }
  toggle() {
    this.open ? this.close() : this.show();
  }
  show() {
    this.open = true;
    this.setVisible(true);
    this.status.setText("");
    this.refresh();
  }
  close() {
    this.open = false;
    this.setVisible(false);
  }

  private rowY(i: number, rowH: number) {
    return this.y + 66 + i * rowH;
  }

  private buy(i: number) {
    if (!this.open) return;
    const w = EXOTIC_WEAPONS[i];
    if (!w) return;
    const res = this.hooks.buy(w.id);
    if (res === "ok") this.flash(`✓ ${w.name} acquired — equip it from your bag (I)`, "#39ff88");
    else if (res === "poor") this.flash(`✗ not enough $METRO (need ◈ ${fmtMetro(w.metro ?? 0)})`, "#ff3b6b");
    else if (res === "full") this.flash("✗ bag full — sell or drop something first", "#ff3b6b");
    else this.flash("✗ start the campaign first — exotics need a runner to wield them", "#ff3b6b");
    this.refresh();
  }

  private flash(msg: string, color: string) {
    this.status.setText(msg).setColor(color).setAlpha(1);
    this.scene.tweens.killTweensOf(this.status);
    this.scene.tweens.add({ targets: this.status, alpha: 0.55, duration: 1600 });
  }

  private refresh() {
    const g = this.g;
    g.clear();
    drawPanelFrame(g, this.x, this.y, this.w, this.h);
    const metro = this.hooks.getMetro();
    this.header.setText(`◈ THE BLACK MARKET          BALANCE:  ◈ ${fmtMetro(metro)} $METRO  (${metroUsdLabel(metro)})`);
    EXOTIC_WEAPONS.forEach((w, i) => {
      const price = w.metro ?? 0;
      const afford = metro >= price;
      this.rowTitle[i]
        .setText(`${w.name}   ·   ${w.klass}            ◈ ${fmtMetro(price)}  (${metroUsdLabel(price)})`)
        .setColor(afford ? MAGENTA : "#5a6172");
      this.rowDesc[i].setText(`${w.desc}    ⚔ ${w.primary.damage} base dmg`);
    });
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.zones.forEach((z) => z.setVisible(v));
    this.texts.forEach((t) => t.setVisible(v));
  }

  private text(x: number, y: number, s: string, color: string, size: string, depth: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: size, color })
      .setScrollFactor(0)
      .setDepth(depth);
    this.texts.push(t);
    return t;
  }
}

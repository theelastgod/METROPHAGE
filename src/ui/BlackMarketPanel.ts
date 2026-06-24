import Phaser from "phaser";
import { VIEW_W, VIEW_H } from "../config";
import { WEAPON_STORE, type WeaponDef } from "../game/weapons";
import { CONSUMABLES, type ConsumableDef } from "../game/consumables";
import { fmtMetro } from "../economy/metro";
import { iconKey } from "../assets/itemIcons";
import { drawPanelFrame } from "./panelChrome";

/** What the host scene must provide — the panel never touches the save/inventory itself. */
export interface BlackMarketHooks {
  getMetro: () => number;
  buyWeapon: (id: string) => "ok" | "poor" | "full" | "nochar";
  buyConsumable: (id: string) => "ok" | "poor" | "nochar";
}

type Entry =
  | { kind: "weapon"; w: WeaponDef }
  | { kind: "consumable"; c: ConsumableDef }
  | { kind: "header"; label: string };

const TIER_HEX: Record<string, string> = { common: "#9aa3b2", rare: "#39e0ff", exotic: "#ff2bd6" };

/**
 * THE BLACK MARKET — the city arms dealer. A scrollable catalogue of every weapon
 * (cheap commons → exotics) and the med/utility consumables, each with a tinted icon,
 * tier-coloured price in $METRO, and a one-line stat. Scroll with the wheel; click to buy.
 */
export default class BlackMarketPanel {
  private scene: Phaser.Scene;
  private hooks: BlackMarketHooks;
  private g: Phaser.GameObjects.Graphics;
  private statics: Phaser.GameObjects.Text[] = [];
  private header!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private icons: Phaser.GameObjects.Image[] = [];
  private titles: Phaser.GameObjects.Text[] = [];
  private subs: Phaser.GameObjects.Text[] = [];
  private zones: Phaser.GameObjects.Zone[] = [];
  private open = false;
  private offset = 0;
  private entries: Entry[] = [];

  private readonly x = 60;
  private readonly y = 30;
  private readonly w = VIEW_W - 120;
  private readonly h = VIEW_H - 48;
  private readonly rowH = 40;
  private readonly listTop: number;
  private readonly visible: number;

  constructor(scene: Phaser.Scene, hooks: BlackMarketHooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.listTop = this.y + 58;
    this.visible = Math.floor((this.h - 74) / this.rowH);
    this.entries = [
      { kind: "header", label: "WEAPONS" },
      ...WEAPON_STORE.map((w) => ({ kind: "weapon", w }) as Entry),
      { kind: "header", label: "MEDS & UTILITY" },
      ...CONSUMABLES.map((c) => ({ kind: "consumable", c }) as Entry),
    ];

    this.g = scene.add.graphics().setScrollFactor(0).setDepth(1600);
    const D = 1601;
    this.header = this.text(this.x + 16, this.y + 12, "", "#eafdff", "14px", D);
    this.text(this.x + 16, this.y + 36, "ARMS + MEDS · paid in $METRO · 1B fixed supply · scroll ▲▼ · click to buy", "#9aa3b2", "10px", D);

    for (let r = 0; r < this.visible; r++) {
      const ry = this.listTop + r * this.rowH;
      const img = scene.add.image(this.x + 34, ry + this.rowH / 2, iconKey("PISTOL")).setDisplaySize(30, 30).setScrollFactor(0).setDepth(D + 1);
      this.icons.push(img);
      this.titles.push(this.text(this.x + 60, ry + 6, "", "#eafdff", "12px", D + 1));
      this.subs.push(this.text(this.x + 60, ry + 23, "", "#7a8295", "9px", D + 1));
      const z = scene.add.zone(this.x + 12, ry + 2, this.w - 24, this.rowH - 4).setOrigin(0).setScrollFactor(0).setInteractive({ useHandCursor: true });
      z.on("pointerdown", () => this.buyRow(r));
      z.on("pointerover", () => this.titles[r].setColor("#ffffff"));
      z.on("pointerout", () => this.refresh());
      this.zones.push(z);
    }

    this.status = this.text(this.x + 16, this.y + this.h - 26, "", "#f7ff3c", "11px", D + 1);
    this.text(this.x + this.w - 128, this.y + this.h - 26, "B / E / ESC to close", "#9aa3b2", "10px", D);

    scene.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (!this.open) return;
      this.scrollBy(dy > 0 ? 1 : -1);
    });

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
    this.offset = 0;
    this.setVisible(true);
    this.status.setText("");
    this.refresh();
  }
  close() {
    this.open = false;
    this.setVisible(false);
  }

  private scrollBy(d: number) {
    const max = Math.max(0, this.entries.length - this.visible);
    this.offset = Phaser.Math.Clamp(this.offset + d, 0, max);
    this.refresh();
  }

  private buyRow(r: number) {
    const e = this.entries[this.offset + r];
    if (!e || e.kind === "header") return;
    let res: string;
    let name: string;
    let price: number;
    if (e.kind === "weapon") {
      res = this.hooks.buyWeapon(e.w.id);
      name = e.w.name;
      price = e.w.metro;
    } else {
      res = this.hooks.buyConsumable(e.c.id);
      name = e.c.name;
      price = e.c.metro;
    }
    if (res === "ok") this.flash(`✓ ${name} acquired — in your bag`, "#39ff88");
    else if (res === "poor") this.flash(`✗ not enough $METRO (need ◈ ${fmtMetro(price)})`, "#ff3b6b");
    else if (res === "full") this.flash("✗ bag full — sell or drop something", "#ff3b6b");
    else this.flash("✗ start the campaign first", "#ff3b6b");
    this.refresh();
  }

  private flash(msg: string, color: string) {
    this.status.setText(msg).setColor(color).setAlpha(1);
    this.scene.tweens.killTweensOf(this.status);
    this.scene.tweens.add({ targets: this.status, alpha: 0.6, duration: 1600 });
  }

  private refresh() {
    const g = this.g;
    g.clear();
    drawPanelFrame(g, this.x, this.y, this.w, this.h);
    const metro = this.hooks.getMetro();
    this.header.setText(`◈ THE BLACK MARKET          BALANCE:  ◈ ${fmtMetro(metro)} $METRO`);

    for (let r = 0; r < this.visible; r++) {
      const e = this.entries[this.offset + r];
      const ry = this.listTop + r * this.rowH;
      const icon = this.icons[r];
      const title = this.titles[r];
      const sub = this.subs[r];
      if (!e) {
        icon.setVisible(false);
        title.setText("");
        sub.setText("");
        continue;
      }
      if (e.kind === "header") {
        icon.setVisible(false);
        g.fillStyle(0x14102a, 0.9).fillRect(this.x + 10, ry + 2, this.w - 20, this.rowH - 4);
        title.setText(`— ${e.label} —`).setColor("#00e5ff");
        sub.setText("");
        continue;
      }
      g.lineStyle(1, 0x2a2440, 0.6).lineBetween(this.x + 12, ry + this.rowH - 1, this.x + this.w - 12, ry + this.rowH - 1);
      if (e.kind === "weapon") {
        const w = e.w;
        const afford = metro >= w.metro;
        icon.setVisible(true).setTexture(iconKey(w.klass)).setTint(w.tint).setAlpha(afford ? 1 : 0.4);
        title.setText(`${w.name}   ·   ${w.klass}`).setColor(afford ? TIER_HEX[w.tier] : "#5a6172");
        sub.setText(`${w.desc}   ⚔ ${w.primary.damage}            ◈ ${fmtMetro(w.metro)}`).setColor("#7a8295");
      } else {
        const c = e.c;
        const afford = metro >= c.metro;
        icon.setVisible(true).setTexture(iconKey(c.klass)).setTint(Phaser.Display.Color.HexStringToColor(c.hex).color).setAlpha(afford ? 1 : 0.4);
        title.setText(`${c.name}`).setColor(afford ? c.hex : "#5a6172");
        sub.setText(`${c.desc}            ◈ ${fmtMetro(c.metro)}`).setColor("#7a8295");
      }
    }
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.statics.forEach((t) => t.setVisible(v));
    this.zones.forEach((z) => z.setVisible(v));
    this.icons.forEach((i) => i.setVisible(v));
    this.titles.forEach((t) => t.setVisible(v));
    this.subs.forEach((s) => s.setVisible(v));
  }

  private text(x: number, y: number, s: string, color: string, size: string, depth: number) {
    const t = this.scene.add
      .text(x, y, s, { fontFamily: "Courier New, monospace", fontSize: size, color })
      .setScrollFactor(0)
      .setDepth(depth);
    this.statics.push(t);
    return t;
  }
}

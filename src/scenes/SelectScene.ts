import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
import { PLAYER_KEY } from "../assets/manifest";
import { CLASSES } from "../game/classes";

/**
 * Class-select screen. Boot -> Select -> Game. Picks a ClassDef, stashes its id in
 * the registry, and starts GameScene. Cards are drawn from the class data so adding
 * a class is data-only.
 */
export default class SelectScene extends Phaser.Scene {
  private hover = -1;
  private frames!: Phaser.GameObjects.Graphics;
  private cardRects: Array<{ x: number; y: number; w: number; h: number }> = [];

  constructor() {
    super("Select");
  }

  create() {
    const boot = document.getElementById("boot");
    if (boot) boot.remove();

    this.cameras.main.setBackgroundColor(COLORS.bgVoid);

    this.add
      .text(VIEW_W / 2, 30, "METROPHAGE", {
        fontFamily: "Courier New, monospace",
        fontSize: "34px",
        color: "#ff2bd6",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#00e5ff", 16, true, true);
    this.add
      .text(VIEW_W / 2, 62, "SELECT YOUR CYBERIAN", {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: "#00e5ff",
      })
      .setOrigin(0.5);

    this.frames = this.add.graphics();

    const n = CLASSES.length;
    const margin = 30;
    const gap = 18;
    const cardW = (VIEW_W - margin * 2 - gap * (n - 1)) / n;
    const cardH = 232;
    const cardY = 96;

    CLASSES.forEach((c, i) => {
      const x = margin + i * (cardW + gap);
      this.cardRects.push({ x, y: cardY, w: cardW, h: cardH });
      const cx = x + cardW / 2;

      this.add.image(cx, cardY + 52, PLAYER_KEY, 0).setScale(2.4).setTint(c.color);
      this.add
        .text(cx, cardY + 96, c.name, {
          fontFamily: "Courier New, monospace",
          fontSize: "14px",
          color: c.hex,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.add
        .text(cx, cardY + 120, c.primaryName, {
          fontFamily: "Courier New, monospace",
          fontSize: "11px",
          color: "#eafdff",
        })
        .setOrigin(0.5);
      this.add
        .text(x + 10, cardY + 142, c.primaryDesc, {
          fontFamily: "Courier New, monospace",
          fontSize: "10px",
          color: "#9aa3b2",
          wordWrap: { width: cardW - 20 },
        })
        .setOrigin(0);
      this.add
        .text(x + 10, cardY + 178, `Q  ${c.ability.name}\nF  ${c.ultimate.name}`, {
          fontFamily: "Courier New, monospace",
          fontSize: "9px",
          color: c.hex,
          lineSpacing: 3,
        })
        .setOrigin(0);
      this.add
        .text(cx, cardY + cardH - 16, `[ ${i + 1} ]`, {
          fontFamily: "Courier New, monospace",
          fontSize: "12px",
          color: c.hex,
        })
        .setOrigin(0.5);

      const zone = this.add
        .zone(x, cardY, cardW, cardH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      zone.on("pointerover", () => {
        this.hover = i;
        this.drawFrames();
      });
      zone.on("pointerout", () => {
        this.hover = -1;
        this.drawFrames();
      });
      zone.on("pointerdown", () => this.select(i));
    });

    this.add
      .text(VIEW_W / 2, VIEW_H - 22, "CLICK a class  ·  or press 1–4", {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#f7ff3c",
      })
      .setOrigin(0.5);

    this.drawFrames();

    this.input.keyboard?.on("keydown", (e: KeyboardEvent) => {
      const k = parseInt(e.key, 10);
      if (k >= 1 && k <= CLASSES.length) this.select(k - 1);
    });
  }

  private drawFrames() {
    const g = this.frames;
    g.clear();
    this.cardRects.forEach((r, i) => {
      const c = CLASSES[i];
      const hovered = this.hover === i;
      g.fillStyle(hovered ? 0x141026 : 0x0b0716, hovered ? 0.95 : 0.8);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(hovered ? 3 : 2, c.color, hovered ? 1 : 0.7);
      g.strokeRect(r.x, r.y, r.w, r.h);
    });
  }

  private select(i: number) {
    this.registry.set("classId", CLASSES[i].id);
    this.scene.start("Game");
  }
}

import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS, UI_SCALE, uiDim, uiFont } from "../config";
import { playerKeyFor } from "../assets/manifest";
import { CLASSES } from "../game/classes";

import OptionsPanel from "../ui/OptionsPanel";
import NeonPipeline from "../render/NeonPipeline";
import MusicDirector from "../audio/MusicDirector";

/**
 * Class-select screen. Boot -> Select -> Game. Picks a ClassDef, stashes its id in
 * the registry, and starts GameScene. Cards are drawn from the class data so adding
 * a class is data-only.
 */
export default class SelectScene extends Phaser.Scene {
  private hover = -1;
  private frames!: Phaser.GameObjects.Graphics;
  private cardRects: Array<{ x: number; y: number; w: number; h: number }> = [];
  private options!: OptionsPanel;
  private neon?: NeonPipeline;

  constructor() {
    super("Select");
  }

  create() {
    const boot = document.getElementById("boot");
    if (boot) boot.remove();

    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    this.cameras.main.fadeIn(500, 2, 2, 8);
    MusicDirector.for(this)?.play("menu", this); // title theme (shared across the menu flow)
    this.applyNeon();

    const title = this.add
      .text(VIEW_W / 2, 28, "METROPHAGE", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(42),
        color: "#ff2bd6",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#00e5ff", 6, true, true)
      .setAlpha(0);
    // Entrance + a recurring broadcast-interference flicker on the neon title.
    this.tweens.add({
      targets: title,
      alpha: 1,
      scale: { from: 1.5, to: 1 },
      duration: 700,
      ease: "Back.out",
    });
    this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: () => {
        if (!this.neon) return;
        this.neon.glitch = 0.24;
        this.tweens.add({ targets: this.neon, glitch: 0, duration: 300 });
        this.tweens.add({ targets: title, x: VIEW_W / 2 + 3, duration: 60, yoyo: true });
      },
    });

    this.add
      .text(VIEW_W / 2, 62, "SELECT YOUR CYBERIAN", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(13),
        color: "#00e5ff",
      })
      .setOrigin(0.5);
    this.add
      .text(VIEW_W / 2, 74, "the city rebuilds what you burn", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(10),
        color: "#6b7184",
        fontStyle: "italic",
      })
      .setOrigin(0.5);

    this.add
      .text(VIEW_W / 2, 82, "progress lives on the server — pick a class to deploy a new cyberian", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(11),
        color: "#6b7184",
      })
      .setOrigin(0.5);

    this.frames = this.add.graphics();

    const n = CLASSES.length;
    const margin = uiDim(30);
    const gap = uiDim(18);
    const cardW = (VIEW_W - margin * 2 - gap * (n - 1)) / n;
    const cardH = uiDim(232);
    // Centre the card band in the space between the header and the footer hint, so the
    // taller (supersampled) viewport doesn't leave the cards stranded near the top.
    const cardY = Math.round((VIEW_H - cardH) / 2 + 20);

    CLASSES.forEach((c, i) => {
      const x = margin + i * (cardW + gap);
      this.cardRects.push({ x, y: cardY, w: cardW, h: cardH });
      const cx = x + cardW / 2;

      this.add.image(cx, cardY + uiDim(52), playerKeyFor(c.id), 0).setScale(2.4 * UI_SCALE).setTint(c.color);
      this.add
        .text(cx, cardY + 96, c.name, {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(14),
          color: c.hex,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.add
        .text(cx, cardY + 120, c.primaryName, {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(11),
          color: "#eafdff",
        })
        .setOrigin(0.5);
      this.add
        .text(x + 10, cardY + 142, c.primaryDesc, {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(10),
          color: "#9aa3b2",
          wordWrap: { width: cardW - 20 },
        })
        .setOrigin(0);
      this.add
        .text(x + 10, cardY + 178, `Q  ${c.ability.name}\nF  ${c.ultimate.name}`, {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(9),
          color: c.hex,
          lineSpacing: 3,
        })
        .setOrigin(0);
      this.add
        .text(cx, cardY + cardH - 16, `[ ${i + 1} ]`, {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(12),
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
        fontSize: uiFont(12),
        color: "#f7ff3c",
      })
      .setOrigin(0.5);

    // Options / accessibility (top-right).
    this.options = new OptionsPanel(this, () => MusicDirector.for(this)?.applyVolumes());
    const optBtn = this.add
      .text(VIEW_W - 16, 14, "⚙ OPTIONS", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(12),
        color: "#9aa3b2",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    optBtn.on("pointerover", () => optBtn.setColor("#eafdff"));
    optBtn.on("pointerout", () => optBtn.setColor("#9aa3b2"));
    optBtn.on("pointerdown", () => this.options.toggle());

    const onlineBtn = this.add
      .text(16, 14, "⊕ ENTER WORLD", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(12),
        color: "#39ff88",
      })
      .setInteractive({ useHandCursor: true });
    onlineBtn.on("pointerover", () => onlineBtn.setColor("#eafdff"));
    onlineBtn.on("pointerout", () => onlineBtn.setColor("#39ff88"));
    onlineBtn.on("pointerdown", () => {
      if (this.options?.isOpen) return;
      this.cameras.main.fadeOut(250, 2, 2, 8);
      this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Online", { zone: "tutorial" }));
    });

    this.drawFrames();

    this.input.keyboard?.on("keydown", (e: KeyboardEvent) => {
      if (e.key === "o" || e.key === "O") {
        this.options.toggle();
        return;
      }
      if (e.key === "Escape") {
        this.options.close();
        return;
      }
      if (this.options.isOpen) return;
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

  private applyNeon() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon");
    this.neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline;
    if (this.neon) {
      this.neon.heat = 0.1; // gentle title glow — keep the menu text crisp
      this.neon.tint = [1, 0.17, 0.84];
      this.neon.tintAmt = 0.16;
    }
  }

  private select(i: number) {
    if (this.options?.isOpen) return;
    // a class card = a fresh run → customize the cyberian before deploying
    this.registry.set("classId", CLASSES[i].id);
    this.cameras.main.fadeOut(300, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Customize"));
  }
}

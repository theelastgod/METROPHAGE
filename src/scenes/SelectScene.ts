import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
import { playerKeyFor } from "../assets/manifest";
import { CLASSES, getClass } from "../game/classes";
import { loadSave } from "../systems/Save";
import OptionsPanel from "../ui/OptionsPanel";
import NeonPipeline from "../render/NeonPipeline";

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
    this.applyNeon();

    const title = this.add
      .text(VIEW_W / 2, 28, "METROPHAGE", {
        fontFamily: "Courier New, monospace",
        fontSize: "42px",
        color: "#ff2bd6",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#00e5ff", 16, true, true)
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
        fontSize: "13px",
        color: "#00e5ff",
      })
      .setOrigin(0.5);
    this.add
      .text(VIEW_W / 2, 74, "the city rebuilds what you burn", {
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        color: "#6b7184",
        fontStyle: "italic",
      })
      .setOrigin(0.5);

    // CONTINUE (resume save) if one exists.
    const save = loadSave();
    if (save) {
      const c = getClass(save.progress.classId);
      const who = save.customization?.callsign
        ? `${save.customization.callsign} · ${c.name}`
        : c.name;
      const cont = this.add
        .text(
          VIEW_W / 2,
          82,
          `▶ CONTINUE — ${who}  Lv ${save.progress.level}   (or pick a class for a NEW run)`,
          { fontFamily: "Courier New, monospace", fontSize: "12px", color: "#39ff88" },
        )
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      cont.on("pointerdown", () => this.startGame(true));
      this.input.keyboard?.on("keydown-ENTER", () => {
        if (this.options.isOpen) return;
        this.startGame(true);
      });
    }

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

      this.add.image(cx, cardY + 52, playerKeyFor(c.id), 0).setScale(2.4).setTint(c.color);
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

    // Options / accessibility (top-right).
    this.options = new OptionsPanel(this);
    const optBtn = this.add
      .text(VIEW_W - 16, 14, "⚙ OPTIONS", {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#9aa3b2",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    optBtn.on("pointerover", () => optBtn.setColor("#eafdff"));
    optBtn.on("pointerout", () => optBtn.setColor("#9aa3b2"));
    optBtn.on("pointerdown", () => this.options.toggle());

    // ONLINE (beta) — Phase 4 shared-world client (server-authoritative movement).
    const onlineBtn = this.add
      .text(16, 14, "⊕ ONLINE (beta)", {
        fontFamily: "Courier New, monospace",
        fontSize: "12px",
        color: "#39ff88",
      })
      .setInteractive({ useHandCursor: true });
    onlineBtn.on("pointerover", () => onlineBtn.setColor("#eafdff"));
    onlineBtn.on("pointerout", () => onlineBtn.setColor("#39ff88"));
    onlineBtn.on("pointerdown", () => {
      if (this.options?.isOpen) return;
      this.cameras.main.fadeOut(250, 2, 2, 8);
      this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Online"));
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
      this.neon.heat = 0.46; // steady title glow, still legible
      this.neon.tint = [1, 0.17, 0.84];
      this.neon.tintAmt = 0.16;
    }
  }

  /** Fade out, then enter the game (fresh class run or resume). */
  private startGame(resume: boolean) {
    if (this.options?.isOpen) return;
    this.registry.set("resume", resume);
    this.cameras.main.fadeOut(350, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Game"));
  }

  private select(i: number) {
    if (this.options?.isOpen) return;
    // a class card = a fresh run → customize the cyberian before deploying
    this.registry.set("classId", CLASSES[i].id);
    this.cameras.main.fadeOut(300, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Customize"));
  }
}

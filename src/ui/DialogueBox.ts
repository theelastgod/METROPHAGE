import Phaser from "phaser";
import { COLORS, VIEW_W, VIEW_H } from "../config";
import { UI_FRAME_KEY } from "../assets/manifest";
import { uiDim, uiFont } from "./uiLayout";

export interface DialoguePage {
  speaker: string;
  text: string;
  portrait?: { key: string; frame?: number };
  /** Branching: choices shown after this page types out (pick via 1–N / click). */
  choices?: string[];
}

/**
 * FFVI-style framed dialogue box: portrait slot (skill_frame UI art) + banner
 * speaker name + typewriter body text, advanced with SPACE / click. Every element
 * is camera-fixed (scrollFactor 0) and toggled together — no Container, to keep
 * scroll/depth behaviour identical to the HUD. The scene freezes the sim while open.
 */
export default class DialogueBox {
  private scene: Phaser.Scene;
  private frame: Phaser.GameObjects.Graphics;
  private portraitFrame: Phaser.GameObjects.Image;
  private portrait: Phaser.GameObjects.Image;
  private nameText: Phaser.GameObjects.Text;
  private bodyText: Phaser.GameObjects.Text;
  private arrow: Phaser.GameObjects.Text;
  private parts: Array<
    Phaser.GameObjects.Graphics | Phaser.GameObjects.Image | Phaser.GameObjects.Text
  >;

  private pages: DialoguePage[] = [];
  private index = 0;
  private full = "";
  private shown = 0;
  private typeEvent?: Phaser.Time.TimerEvent;
  private open = false;
  private onClose?: () => void;
  private onChoice?: (i: number) => void;
  private choiceTexts: Phaser.GameObjects.Text[] = [];
  private choicesActive = false;

  private readonly boxX = uiDim(40);
  private readonly boxY = VIEW_H - uiDim(156);
  private readonly boxW = VIEW_W - uiDim(80);
  private readonly boxH = uiDim(138);
  private readonly textX = this.boxX + uiDim(132);
  private readonly choiceStep = uiDim(20);
  private readonly portraitSize = uiDim(100);
  private readonly portraitInner = uiDim(82);

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const D = 1500;

    this.frame = scene.add.graphics().setScrollFactor(0).setDepth(D);
    this.drawFrame(this.frame);

    const pcx = this.boxX + uiDim(66);
    const pcy = this.boxY + this.boxH / 2 + uiDim(4);
    this.portraitFrame = scene.add
      .image(pcx, pcy, UI_FRAME_KEY)
      .setScrollFactor(0)
      .setDepth(D + 1)
      .setDisplaySize(this.portraitSize, this.portraitSize);
    this.portrait = scene.add
      .image(pcx, pcy, UI_FRAME_KEY)
      .setScrollFactor(0)
      .setDepth(D + 2)
      .setDisplaySize(this.portraitInner, this.portraitInner);

    this.nameText = scene.add
      .text(this.textX, this.boxY + uiDim(16), "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(17),
        color: "#f7ff3c",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(D + 2);
    this.bodyText = scene.add
      .text(this.textX, this.boxY + uiDim(48), "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(17),
        color: "#eafdff",
        wordWrap: { width: this.boxW - uiDim(168) },
        lineSpacing: uiDim(6),
      })
      .setScrollFactor(0)
      .setDepth(D + 2);
    this.arrow = scene.add
      .text(this.boxX + this.boxW - uiDim(28), this.boxY + this.boxH - uiDim(28), "▼", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(17),
        color: "#00e5ff",
      })
      .setScrollFactor(0)
      .setDepth(D + 2);

    this.parts = [
      this.frame,
      this.portraitFrame,
      this.portrait,
      this.nameText,
      this.bodyText,
      this.arrow,
    ];
    this.setVisible(false);

    scene.tweens.add({
      targets: this.arrow,
      y: this.arrow.y + uiDim(4),
      duration: 480,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });

    for (let i = 0; i < 4; i++) {
      const t = scene.add
        .text(this.textX, this.boxY + uiDim(64) + i * this.choiceStep, "", {
          fontFamily: "Courier New, monospace",
          fontSize: uiFont(15),
          color: "#f7ff3c",
        })
        .setScrollFactor(0)
        .setDepth(D + 3)
        .setVisible(false)
        .setInteractive({ useHandCursor: true });
      t.on("pointerover", () => this.choicesActive && t.setColor("#ffffff"));
      t.on("pointerout", () => this.choicesActive && t.setColor("#f7ff3c"));
      t.on("pointerdown", () => this.pickChoice(i));
      this.choiceTexts.push(t);
    }

    scene.input.on("pointerdown", this.advance, this);
    scene.input.keyboard?.on("keydown-SPACE", this.advance, this);
    scene.input.keyboard?.on("keydown-ENTER", this.advance, this);
    scene.input.keyboard?.on("keydown", (e: KeyboardEvent) => {
      if (!this.choicesActive) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= this.choiceTexts.length) this.pickChoice(n - 1);
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(pages: DialoguePage[], onClose?: () => void, onChoice?: (i: number) => void) {
    if (pages.length === 0) return;
    this.pages = pages;
    this.onClose = onClose;
    this.onChoice = onChoice;
    this.index = 0;
    this.open = true;
    this.setVisible(true);
    this.startPage();
  }

  private setVisible(v: boolean) {
    this.parts.forEach((p) => p.setVisible(v));
    if (!v) this.hideChoices();
  }

  private hideChoices() {
    this.choicesActive = false;
    this.choiceTexts.forEach((t) => t.setVisible(false));
  }

  private renderChoices(choices: string[]) {
    this.arrow.setVisible(false);
    this.choicesActive = true;
    const top = Math.min(this.bodyText.y + this.bodyText.height + uiDim(6), this.boxY + this.boxH - uiDim(42));
    this.choiceTexts.forEach((t, i) => {
      if (i < choices.length) {
        t.setY(top + i * this.choiceStep)
          .setText(`${i + 1})  ${choices[i]}`)
          .setColor("#f7ff3c")
          .setVisible(true);
      } else {
        t.setVisible(false);
      }
    });
  }

  private pickChoice(i: number) {
    if (!this.choicesActive || i >= this.choiceTexts.length || !this.choiceTexts[i].visible) return;
    const cb = this.onChoice;
    this.hideChoices();
    this.open = false;
    this.parts.forEach((p) => p.setVisible(false));
    this.onChoice = undefined;
    this.onClose = undefined;
    cb?.(i);
  }

  private startPage() {
    const p = this.pages[this.index];
    this.nameText.setText(p.speaker);

    if (p.portrait) {
      this.portrait.setVisible(true).setTexture(p.portrait.key, p.portrait.frame ?? undefined);
      this.portrait.setDisplaySize(this.portraitInner, this.portraitInner);
      this.portraitFrame.setVisible(true);
    } else {
      this.portrait.setVisible(false);
      this.portraitFrame.setVisible(false);
    }

    this.full = p.text;
    this.shown = 0;
    this.bodyText.setText("");
    this.arrow.setVisible(false);
    this.hideChoices();

    this.typeEvent?.remove();
    this.typeEvent = this.scene.time.addEvent({
      delay: 22,
      loop: true,
      callback: () => {
        this.shown++;
        this.bodyText.setText(this.full.slice(0, this.shown));
        if (this.shown >= this.full.length) this.finishTyping();
      },
    });
  }

  private finishTyping() {
    this.typeEvent?.remove();
    this.typeEvent = undefined;
    this.bodyText.setText(this.full);
    const choices = this.pages[this.index]?.choices;
    if (choices && choices.length) this.renderChoices(choices);
    else this.arrow.setVisible(true);
  }

  private advance() {
    if (!this.open) return;
    if (this.typeEvent) {
      this.finishTyping();
      return;
    }
    if (this.choicesActive) return;
    this.index++;
    if (this.index >= this.pages.length) this.close();
    else this.startPage();
  }

  private close() {
    this.open = false;
    this.setVisible(false);
    this.typeEvent?.remove();
    this.typeEvent = undefined;
    const cb = this.onClose;
    this.onClose = undefined;
    cb?.();
  }

  private drawFrame(g: Phaser.GameObjects.Graphics) {
    const { boxX: x, boxY: y, boxW: w, boxH: h } = this;
    g.fillStyle(0x07061a, 0.92).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), COLORS.neonCyan, 0.9).strokeRect(x, y, w, h);
    g.lineStyle(uiDim(1), COLORS.neonMagenta, 0.6).strokeRect(x + uiDim(4), y + uiDim(4), w - uiDim(8), h - uiDim(8));
    g.fillStyle(COLORS.neonCyan, 0.18).fillRect(x + uiDim(120), y + uiDim(6), w - uiDim(154), uiDim(28));
  }
}
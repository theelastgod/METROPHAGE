import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS, UI_SCALE, uiDim } from "../config";
import { getClass, ClassDef } from "../game/classes";
import MusicDirector from "../audio/MusicDirector";
import {
  Customization,
  randomCustomization,
  bakeCustomPlayer,
  PLAYER_CUSTOM_KEY,
  CUSTOM_COLORS,
  CUSTOM_BUILDS,
  HUMAN_HEADS,
  HUMAN_VISORS,
  CUSTOM_SHOULDERS,
  CUSTOM_DECALS,
  CUSTOM_CLOAKS,
  CUSTOM_SEXES,
  SEX_LABELS,
  SKIN_TONES,
  HAIR_STYLES,
  HAIR_COLORS,
  BEARDS,
  FACE_MARKS,
  EYE_COLORS,
  CUSTOM_GLOVES,
  CUSTOM_LEG_GEAR,
  HEAD_LABELS,
  VISOR_LABELS,
  BUILD_LABELS,
  SHOULDERS_LABELS,
  DECAL_LABELS,
  CLOAK_LABELS,
  HAIR_LABELS,
  BEARD_LABELS,
  FACE_MARK_LABELS,
  GLOVES_LABELS,
  LEG_GEAR_LABELS,
  CALLSIGN_MAX,
  randomCallsign,
} from "../game/customization";
import { applyMenuNeon } from "../render/ensureNeon";
import { fadeInScene, transitionTo } from "../systems/transitions";
import { asMenuUi, installMenuCameras, pinMenuUiLayer } from "../render/menuCameras";
import { drawMenuBackdrop, drawPreviewPedestal, MenuAtmosphere, MENU_PAD, MENU_SECTION_GAP } from "../ui/menuChrome";
import { uiGap } from "../ui/spacing";
import { bodyFont, displayFont, uiFont } from "../ui/typography";
import { drawPanelFrame } from "../ui/panelChrome";
import { connectedWallet } from "../economy/wallet";

interface Row {
  label: string;
  value: () => string;
  swatch?: () => number;
  cycle: (dir: number) => void;
}

/**
 * One-time character creator — full-screen, humanoid body tuning, bound to the
 * connected wallet on first deploy.
 */
export default class CustomizeScene extends Phaser.Scene {
  private classDef!: ClassDef;
  private cust!: Customization;
  private rowIndex = 0;
  private rows: Row[] = [];
  private preview!: Phaser.GameObjects.Container;
  private callsignText!: Phaser.GameObjects.Text;
  private caretOn = true;
  private rowG!: Phaser.GameObjects.Graphics;
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private rowValTexts: Phaser.GameObjects.Text[] = [];
  private rowSwatches: Phaser.GameObjects.Rectangle[] = [];
  private rowLeftBtns: Phaser.GameObjects.Text[] = [];
  private rowRightBtns: Phaser.GameObjects.Text[] = [];
  private rowZones: Phaser.GameObjects.Zone[] = [];
  private scrollHint!: Phaser.GameObjects.Text;
  private rowScroll = 0;

  private readonly panelX = Math.round(VIEW_W * 0.52);
  private readonly panelW = VIEW_W - this.panelX - MENU_PAD;
  private readonly previewX = MENU_PAD;
  private readonly previewW = this.panelX - this.previewX - uiDim(6);
  private readonly listTop = uiDim(176);
  private readonly listBottom = VIEW_H - uiDim(88);
  private readonly rowH = uiDim(32);
  private readonly visibleRows = Math.max(4, Math.floor((this.listBottom - this.listTop) / this.rowH));

  constructor() {
    super("Customize");
  }

  create() {
    if (this.registry.get("characterLocked")) {
      this.scene.start("Select");
      return;
    }
    if (!connectedWallet() && !this.registry.get("walletAddress") && !this.registry.get("offlinePlay")) {
      this.scene.start("Select");
      return;
    }

    this.classDef = getClass(this.registry.get("classId") as string | undefined);
    this.cust = randomCustomization(this.classDef.id);

    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    installMenuCameras(this);
    fadeInScene(this);
    MusicDirector.for(this)?.play("menu", this);
    this.applyNeon();
    drawMenuBackdrop(this);
    new MenuAtmosphere(this);

    this.add
      .text(VIEW_W / 2, uiDim(52), "CREATE YOUR RUNNER", displayFont(32, { color: "#00e5ff", fontStyle: "bold" }))
      .setOrigin(0.5)
      .setShadow(0, 0, "#ff2bd6", 6, true, true);

    const wallet = (this.registry.get("walletAddress") as string | undefined) ?? connectedWallet() ?? "—";
    const short = wallet.length > 12 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
    this.add
      .text(VIEW_W / 2, uiDim(96), `ONE-TIME CREATION  ·  bound to wallet ${short}  ·  ${this.classDef.name}`, bodyFont(13, { color: "#f7ff3c" }))
      .setOrigin(0.5);

    const py = uiDim(128);
    const ph = VIEW_H - py - uiDim(104);
    const pg = asMenuUi(this.add.graphics().setDepth(8));
    drawPanelFrame(pg, this.previewX, py, this.previewW, ph);
    // label chrome rides above the preview model (depth 12) so the sprite can't cover it
    const previewLabelY = py + uiDim(13);
    const previewLabelG = asMenuUi(this.add.graphics().setDepth(13));
    previewLabelG.fillStyle(0x04030c, 0.92).fillRect(this.previewX + uiDim(12), previewLabelY - uiDim(4), this.previewW - uiDim(24), uiDim(22));
    asMenuUi(
      this.add
        .text(this.previewX + this.previewW / 2, previewLabelY + uiDim(7), "RUNNER PREVIEW", displayFont(12, { color: "#9aa3b2", fontStyle: "bold" }))
        .setOrigin(0.5)
        .setDepth(14),
    );
    drawPreviewPedestal(this, this.previewX + this.previewW / 2, py + ph - uiDim(36), this.classDef.color, 10);
    this.preview = asMenuUi(this.add.container(0, 0).setDepth(12));
    this.makeCallsignField();
    this.makeListViewport();
    this.defineRows();
    this.bakeAndRefresh();
    this.renderRows();
    this.scrollHint = this.add
      .text(this.panelX + this.panelW / 2, this.listBottom + uiDim(6), "", bodyFont(10, { color: "#6b7184" }))
      .setOrigin(0.5, 0);

    this.buildFooter();

    this.setupInput();
    pinMenuUiLayer(this);
  }

  private defineRows() {
    const cycleIn = <T>(arr: ReadonlyArray<T>, cur: T, dir: number): T => {
      const i = Math.max(0, arr.indexOf(cur));
      return arr[(i + dir + arr.length) % arr.length];
    };
    this.rows = [
      {
        label: "COLOUR",
        value: () => CUSTOM_COLORS.find((c) => c.value === this.cust.color)?.name ?? "CUSTOM",
        swatch: () => this.cust.color,
        cycle: (d) => {
          const i = Math.max(0, CUSTOM_COLORS.findIndex((c) => c.value === this.cust.color));
          this.cust.color = CUSTOM_COLORS[(i + d + CUSTOM_COLORS.length) % CUSTOM_COLORS.length].value;
          this.bakeAndRefresh();
        },
      },
      {
        label: "BODY TYPE",
        value: () => SEX_LABELS[this.cust.sex],
        cycle: (d) => {
          this.cust.sex = cycleIn(CUSTOM_SEXES, this.cust.sex, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "FRAME",
        value: () => BUILD_LABELS[this.cust.build],
        cycle: (d) => {
          this.cust.build = cycleIn(CUSTOM_BUILDS, this.cust.build, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "SKIN",
        value: () => SKIN_TONES.find((s) => s.value === this.cust.skin)?.name ?? "TAN",
        swatch: () => this.cust.skin,
        cycle: (d) => {
          const i = Math.max(0, SKIN_TONES.findIndex((s) => s.value === this.cust.skin));
          this.cust.skin = SKIN_TONES[(i + d + SKIN_TONES.length) % SKIN_TONES.length].value;
          this.bakeAndRefresh();
        },
      },
      {
        label: "HAIR",
        value: () => HAIR_LABELS[this.cust.hair],
        cycle: (d) => {
          this.cust.hair = cycleIn(HAIR_STYLES, this.cust.hair, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "HAIR COLOUR",
        value: () => HAIR_COLORS.find((c) => c.value === this.cust.hairColor)?.name ?? "CUSTOM",
        swatch: () => this.cust.hairColor,
        cycle: (d) => {
          const i = Math.max(0, HAIR_COLORS.findIndex((c) => c.value === this.cust.hairColor));
          this.cust.hairColor = HAIR_COLORS[(i + d + HAIR_COLORS.length) % HAIR_COLORS.length].value;
          this.bakeAndRefresh();
        },
      },
      {
        label: "BEARD",
        value: () => BEARD_LABELS[this.cust.beard],
        cycle: (d) => {
          this.cust.beard = cycleIn(BEARDS, this.cust.beard, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "EYE COLOUR",
        value: () => EYE_COLORS.find((c) => c.value === this.cust.eyeColor)?.name ?? "CUSTOM",
        swatch: () => this.cust.eyeColor,
        cycle: (d) => {
          const i = Math.max(0, EYE_COLORS.findIndex((c) => c.value === this.cust.eyeColor));
          this.cust.eyeColor = EYE_COLORS[(i + d + EYE_COLORS.length) % EYE_COLORS.length].value;
          this.bakeAndRefresh();
        },
      },
      {
        label: "FACE MARK",
        value: () => FACE_MARK_LABELS[this.cust.faceMark],
        cycle: (d) => {
          this.cust.faceMark = cycleIn(FACE_MARKS, this.cust.faceMark, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "TRIM COLOUR",
        value: () => CUSTOM_COLORS.find((c) => c.value === this.cust.accentColor)?.name ?? "CUSTOM",
        swatch: () => this.cust.accentColor,
        cycle: (d) => {
          const i = Math.max(0, CUSTOM_COLORS.findIndex((c) => c.value === this.cust.accentColor));
          this.cust.accentColor = CUSTOM_COLORS[(i + d + CUSTOM_COLORS.length) % CUSTOM_COLORS.length].value;
          this.bakeAndRefresh();
        },
      },
      {
        label: "HEADGEAR",
        value: () => HEAD_LABELS[this.cust.head],
        cycle: (d) => {
          this.cust.head = cycleIn(HUMAN_HEADS, this.cust.head, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "OPTIC",
        value: () => VISOR_LABELS[this.cust.visor],
        cycle: (d) => {
          this.cust.visor = cycleIn(HUMAN_VISORS, this.cust.visor, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "SHOULDERS",
        value: () => SHOULDERS_LABELS[this.cust.shoulders],
        cycle: (d) => {
          this.cust.shoulders = cycleIn(CUSTOM_SHOULDERS, this.cust.shoulders, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "CLOAK",
        value: () => CLOAK_LABELS[this.cust.cloak],
        cycle: (d) => {
          this.cust.cloak = cycleIn(CUSTOM_CLOAKS, this.cust.cloak, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "CHEST DECAL",
        value: () => DECAL_LABELS[this.cust.decal],
        cycle: (d) => {
          this.cust.decal = cycleIn(CUSTOM_DECALS, this.cust.decal, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "GLOVES",
        value: () => GLOVES_LABELS[this.cust.gloves],
        cycle: (d) => {
          this.cust.gloves = cycleIn(CUSTOM_GLOVES, this.cust.gloves, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "LEG GEAR",
        value: () => LEG_GEAR_LABELS[this.cust.legGear],
        cycle: (d) => {
          this.cust.legGear = cycleIn(CUSTOM_LEG_GEAR, this.cust.legGear, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "ANTENNAE",
        value: () => (this.cust.antennae ? "ON" : "OFF"),
        cycle: () => {
          this.cust.antennae = !this.cust.antennae;
          this.bakeAndRefresh();
        },
      },
      {
        label: "CHEST CORE",
        value: () => (this.cust.emblem ? "ON" : "OFF"),
        cycle: () => {
          this.cust.emblem = !this.cust.emblem;
          this.bakeAndRefresh();
        },
      },
      {
        label: "BANDOLIER",
        value: () => (this.cust.strap ? "ON" : "OFF"),
        cycle: () => {
          this.cust.strap = !this.cust.strap;
          this.bakeAndRefresh();
        },
      },
    ];
  }

  private makeCallsignField() {
    const x = this.panelX;
    const w = this.panelW;
    const y = uiDim(132);
    const h = uiDim(36);
    const g = asMenuUi(this.add.graphics().setDepth(9));
    g.fillStyle(0x0b0716, 0.9).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), 0x00e5ff, 0.7).strokeRect(x, y, w, h);
    g.fillStyle(0x00e5ff, 0.9).fillRect(x, y, uiDim(4), h);
    asMenuUi(
      this.add
        .text(x + uiDim(14), y + h / 2, "CALLSIGN", bodyFont(12, { color: "#6b7184" }))
        .setOrigin(0, 0.5)
        .setDepth(10),
    );
    this.callsignText = asMenuUi(
      this.add
        .text(x + w - uiDim(14), y + h / 2, "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(18),
        color: "#eafdff",
        fontStyle: "bold",
      })
        .setOrigin(1, 0.5)
        .setDepth(10),
    );
    this.renderCallsign();
    this.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => {
        this.caretOn = !this.caretOn;
        this.renderCallsign();
      },
    });
  }

  private renderCallsign() {
    if (!this.callsignText) return;
    const typed = this.cust.callsign || "";
    if (typed) {
      this.callsignText.setText(typed + (this.caretOn ? "_" : " ")).setColor("#eafdff");
    } else {
      this.callsignText.setText((this.caretOn ? "TYPE CALLSIGN_" : "TYPE CALLSIGN")).setColor("#5a6172");
    }
  }

  private bakeAndRefresh() {
    bakeCustomPlayer(this, this.cust);
    this.preview.removeAll(true);
    const cx = this.previewX + this.previewW / 2;
    const cy = uiDim(120) + (VIEW_H - uiDim(200)) * 0.42;
    if (!this.textures.exists(PLAYER_CUSTOM_KEY)) return;
    const hero = this.add.image(cx, cy, PLAYER_CUSTOM_KEY, 0).setScale(8.5 * UI_SCALE).setDepth(12);
    this.preview.add(hero);
    const facings = [1 * 4, 3 * 4, 2 * 4];
    facings.forEach((f, i) => {
      const img = this.add
        .image(cx - uiDim(100) + i * uiDim(100), cy + uiDim(140), PLAYER_CUSTOM_KEY, f)
        .setScale(3.6 * UI_SCALE)
        .setAlpha(0.92)
        .setDepth(12);
      this.preview.add(img);
    });
  }

  private makeListViewport() {
    const listH = this.listBottom - this.listTop;
    const panelBg = asMenuUi(this.add.graphics().setDepth(8));
    panelBg.fillStyle(0x0b0716, 0.96).fillRect(this.panelX, this.listTop - uiGap("sm"), this.panelW, listH + uiGap("lg"));
    panelBg.lineStyle(uiDim(2), this.classDef.color, 0.5).strokeRect(this.panelX, this.listTop - uiGap("sm"), this.panelW, listH + uiGap("lg"));
    this.add
      .zone(this.panelX, this.listTop, this.panelW, listH)
      .setOrigin(0)
      .setInteractive()
      .on("wheel", (_p: Phaser.Input.Pointer, _dx: number, dy: number) => this.scrollList(dy > 0 ? 1 : -1));
  }

  private maxRowScroll() {
    return Math.max(0, this.rows.length - this.visibleRows);
  }

  private scrollList(delta: number) {
    const next = Phaser.Math.Clamp(this.rowScroll + delta, 0, this.maxRowScroll());
    if (next === this.rowScroll) return;
    this.rowScroll = next;
    this.layoutRows();
    this.renderRowValues();
  }

  private ensureRowVisible(index: number) {
    if (index < this.rowScroll) this.rowScroll = index;
    else if (index >= this.rowScroll + this.visibleRows) this.rowScroll = index - this.visibleRows + 1;
    this.rowScroll = Phaser.Math.Clamp(this.rowScroll, 0, this.maxRowScroll());
  }

  private rowY(index: number) {
    return this.listTop + (index - this.rowScroll) * this.rowH + this.rowH / 2;
  }

  private renderRows() {
    this.rowG = asMenuUi(this.add.graphics().setDepth(10));
    this.rows.forEach((row, i) => {
      this.rowTexts.push(
        asMenuUi(
          this.add
            .text(this.panelX + uiDim(16), 0, row.label, bodyFont(13, { color: "#9aa3b2" }))
            .setOrigin(0, 0.5)
            .setDepth(11),
        ),
      );
      this.rowValTexts.push(
        asMenuUi(
          this.add
            .text(VIEW_W - MENU_PAD - uiDim(48), 0, "", bodyFont(13, { color: "#eafdff" }))
            .setOrigin(1, 0.5)
            .setDepth(11),
        ),
      );
      const sw = this.add
        .rectangle(0, 0, uiDim(14), uiDim(14), 0xffffff)
        .setStrokeStyle(uiDim(1), 0x000000, 0.6);
      sw.setVisible(false);
      this.rowSwatches.push(sw);

      const left = this.add
        .text(0, 0, "◀", { fontFamily: "monospace", fontSize: uiFont(14), color: "#6b7184" })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      const right = this.add
        .text(0, 0, "▶", { fontFamily: "monospace", fontSize: uiFont(14), color: "#6b7184" })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      left.on("pointerdown", () => {
        this.rowIndex = i;
        row.cycle(-1);
        this.renderRowValues();
      });
      right.on("pointerdown", () => {
        this.rowIndex = i;
        row.cycle(1);
        this.renderRowValues();
      });
      this.rowLeftBtns.push(left);
      this.rowRightBtns.push(right);

      const z = this.add
        .zone(0, 0, this.panelW - uiDim(16), this.rowH)
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      z.on("pointerdown", () => {
        this.rowIndex = i;
        this.renderRowValues();
      });
      this.rowZones.push(z);
    });
    this.layoutRows();
    this.renderRowValues();
  }

  private layoutRows() {
    this.rows.forEach((_row, i) => {
      const visible = i >= this.rowScroll && i < this.rowScroll + this.visibleRows;
      const y = this.rowY(i);
      this.rowTexts[i].setVisible(visible);
      this.rowValTexts[i].setVisible(visible);
      if (visible) {
        this.rowTexts[i].setY(y);
        this.rowValTexts[i].setY(y);
      }
      this.rowLeftBtns[i].setVisible(visible);
      this.rowRightBtns[i].setVisible(visible);
      this.rowZones[i].setVisible(visible);
      if (visible) {
        this.rowLeftBtns[i].setPosition(this.panelX + uiDim(180), y);
        this.rowRightBtns[i].setPosition(VIEW_W - MENU_PAD - uiDim(8), y);
        this.rowZones[i].setPosition(this.panelX + uiDim(8), y);
        this.rowSwatches[i].setPosition(VIEW_W - MENU_PAD - uiDim(28), y);
      } else {
        this.rowSwatches[i].setVisible(false);
      }
    });
    if (this.scrollHint) {
      const max = this.maxRowScroll();
      this.scrollHint.setText(
        max > 0 ? `scroll ▲▼  ·  ${this.rowScroll + 1}–${Math.min(this.rowScroll + this.visibleRows, this.rows.length)} of ${this.rows.length}` : "",
      );
    }
  }

  private renderRowValues() {
    this.ensureRowVisible(this.rowIndex);
    this.layoutRows();
    this.rowG.clear();
    this.rowG.fillStyle(0x0b0716, 0.35).fillRect(this.panelX, this.listTop, this.panelW, this.listBottom - this.listTop);
    this.rows.forEach((row, i) => {
      if (i < this.rowScroll || i >= this.rowScroll + this.visibleRows) return;
      const y = this.rowY(i);
      const selected = i === this.rowIndex;
      if (selected) {
        this.rowG.fillStyle(this.classDef.color, 0.18).fillRect(this.panelX + uiDim(8), y - this.rowH / 2 + uiDim(3), this.panelW - uiDim(16), this.rowH - uiDim(6));
        this.rowG.lineStyle(uiDim(2), this.classDef.color, 0.9).strokeRect(this.panelX + uiDim(8), y - this.rowH / 2 + uiDim(3), this.panelW - uiDim(16), this.rowH - uiDim(6));
      }
      this.rowTexts[i].setColor(selected ? "#eafdff" : "#9aa3b2");
      const sw = this.rowSwatches[i];
      if (row.swatch) {
        sw.setVisible(true).setFillStyle(row.swatch());
        this.rowValTexts[i].setText(row.value()).setX(VIEW_W - MENU_PAD - uiDim(52));
      } else {
        sw.setVisible(false);
        this.rowValTexts[i].setText(row.value()).setX(VIEW_W - MENU_PAD - uiDim(28));
      }
    });
  }

  private setupInput() {
    this.input.keyboard?.on("keydown", (e: KeyboardEvent) => {
      if (e.key === "Backspace") {
        this.cust.callsign = this.cust.callsign.slice(0, -1);
        this.renderCallsign();
        return;
      }
      if (e.key.length === 1) {
        const ch = e.key.toUpperCase();
        if (/[A-Z0-9-]/.test(ch) && this.cust.callsign.length < CALLSIGN_MAX) {
          this.cust.callsign += ch;
          this.renderCallsign();
        }
        return;
      }
      switch (e.key) {
        case "ArrowUp":
          this.rowIndex = (this.rowIndex - 1 + this.rows.length) % this.rows.length;
          this.ensureRowVisible(this.rowIndex);
          this.renderRowValues();
          break;
        case "ArrowDown":
          this.rowIndex = (this.rowIndex + 1) % this.rows.length;
          this.ensureRowVisible(this.rowIndex);
          this.renderRowValues();
          break;
        case "ArrowLeft":
          this.rows[this.rowIndex].cycle(-1);
          this.renderRowValues();
          break;
        case "ArrowRight":
          this.rows[this.rowIndex].cycle(1);
          this.renderRowValues();
          break;
        case "Enter":
          this.confirm();
          break;
        case "Escape":
          this.goBack();
          break;
      }
    });
  }

  private buildFooter() {
    const footerH = uiDim(56);
    const footerY = VIEW_H - footerH;
    const bar = asMenuUi(this.add.graphics().setDepth(90));
    bar.fillStyle(0x05030c, 0.96).fillRect(0, footerY - uiDim(2), VIEW_W, footerH + uiDim(2));
    bar.lineStyle(1, 0x00e5ff, 0.45).lineBetween(0, footerY, VIEW_W, footerY);

    asMenuUi(
      this.add
        .text(
          VIEW_W / 2,
          footerY - MENU_SECTION_GAP,
          "TYPE callsign · ↑↓ row · ←→ option · scroll wheel · ENTER to deploy",
          bodyFont(10, { color: "#6b7184" }),
        )
        .setOrigin(0.5)
        .setDepth(91),
    );

    const back = asMenuUi(
      this.add
        .text(MENU_PAD, footerY + footerH / 2, "◀ BACK", bodyFont(15, { color: "#9aa3b2" }))
        .setOrigin(0, 0.5)
        .setDepth(91)
        .setInteractive({ useHandCursor: true }),
    );
    back.on("pointerover", () => back.setColor("#eafdff"));
    back.on("pointerout", () => back.setColor("#9aa3b2"));
    back.on("pointerdown", () => this.goBack());

    const deployW = uiDim(248);
    const deployH = uiDim(40);
    const deployX = VIEW_W - MENU_PAD - deployW;
    const deployY = footerY + (footerH - deployH) / 2;
    const deployG = asMenuUi(this.add.graphics().setDepth(91));
    const drawDeploy = (hover: boolean) => {
      deployG.clear();
      deployG.fillStyle(0x39ff88, hover ? 0.3 : 0.16).fillRoundedRect(deployX, deployY, deployW, deployH, 4);
      const inset = uiDim(2);
      deployG
        .lineStyle(uiDim(2), 0x39ff88, hover ? 1 : 0.8)
        .strokeRoundedRect(deployX + inset, deployY + inset, deployW - inset * 2, deployH - inset * 2, 4);
    };
    drawDeploy(false);
    const deployLabel = asMenuUi(
      this.add
        .text(deployX + deployW / 2, deployY + deployH / 2, "LOCK IN & DEPLOY ▶", displayFont(16, { color: "#eafdff", fontStyle: "bold" }))
        .setOrigin(0.5)
        .setDepth(92),
    );
    const deployZone = asMenuUi(
      this.add.zone(deployX, deployY, deployW, deployH).setOrigin(0).setDepth(93).setInteractive({ useHandCursor: true }),
    );
    deployZone.on("pointerover", () => {
      drawDeploy(true);
      deployLabel.setColor("#ffffff");
    });
    deployZone.on("pointerout", () => {
      drawDeploy(false);
      deployLabel.setColor("#eafdff");
    });
    deployZone.on("pointerdown", () => this.confirm());
  }

  private applyNeon() {
    applyMenuNeon(this, { heat: 0.08, tint: [0, 0.9, 1], tintAmt: 0.12 });
  }

  private goBack() {
    transitionTo(this, "Select", undefined, { style: "fade", accent: 0x9aa3b2 });
  }

  private confirm() {
    if (!this.cust.callsign) this.cust.callsign = randomCallsign();
    this.registry.set("classId", this.classDef.id);
    this.registry.set("customization", this.cust);
    this.registry.set("resume", false);
    this.registry.set("characterLocked", true);
    transitionTo(this, "Prologue", undefined, { style: "deploy", accent: this.classDef.color });
  }
}
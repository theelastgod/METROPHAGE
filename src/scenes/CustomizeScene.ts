import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS, UI_SCALE, uiDim, uiFont } from "../config";
import { getClass, ClassDef } from "../game/classes";
import MusicDirector from "../audio/MusicDirector";
import {
  Customization,
  defaultCustomization,
  bakeCustomPlayer,
  PLAYER_CUSTOM_KEY,
  CUSTOM_COLORS,
  CUSTOM_BUILDS,
  CUSTOM_HEADS,
  CUSTOM_VISORS,
  CUSTOM_SHOULDERS,
  CUSTOM_DECALS,
  CUSTOM_CLOAKS,
  CUSTOM_SEXES,
  SEX_LABELS,
  SKIN_TONES,
  HAIR_STYLES,
  HAIR_COLORS,
  BEARDS,
  HEAD_LABELS,
  VISOR_LABELS,
  BUILD_LABELS,
  SHOULDERS_LABELS,
  DECAL_LABELS,
  CLOAK_LABELS,
  HAIR_LABELS,
  BEARD_LABELS,
  CALLSIGN_MAX,
  randomCallsign,
} from "../game/customization";
import NeonPipeline from "../render/NeonPipeline";
import { drawMenuBackdrop, MENU_FOOTER_Y, MENU_PAD } from "../ui/menuChrome";
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
  private neon?: NeonPipeline;

  private preview!: Phaser.GameObjects.Container;
  private callsignText!: Phaser.GameObjects.Text;
  private caretOn = true;
  private rowG!: Phaser.GameObjects.Graphics;
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private rowValTexts: Phaser.GameObjects.Text[] = [];
  private rowSwatches: Phaser.GameObjects.Rectangle[] = [];

  private readonly panelX = Math.round(VIEW_W * 0.52);
  private readonly panelW = VIEW_W - this.panelX - MENU_PAD;
  private readonly previewX = MENU_PAD;
  private readonly previewW = this.panelX - MENU_PAD * 2;
  private readonly rowTop = uiDim(200);
  private readonly rowH = uiDim(34);

  constructor() {
    super("Customize");
  }

  create() {
    if (this.registry.get("characterLocked")) {
      this.scene.start("Select");
      return;
    }
    if (!connectedWallet() && !this.registry.get("walletAddress")) {
      this.scene.start("Select");
      return;
    }

    this.classDef = getClass(this.registry.get("classId") as string | undefined);
    this.cust = defaultCustomization(this.classDef.id);
    this.cust.skin = SKIN_TONES.find((s) => s.value >= 0)?.value ?? 0xc98a5e;

    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    this.cameras.main.fadeIn(350, 2, 2, 8);
    MusicDirector.for(this)?.play("menu", this);
    this.applyNeon();
    drawMenuBackdrop(this);

    this.add
      .text(VIEW_W / 2, uiDim(48), "CREATE YOUR CYBERIAN", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(32),
        color: "#00e5ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#ff2bd6", 6, true, true);

    const wallet = (this.registry.get("walletAddress") as string | undefined) ?? connectedWallet() ?? "—";
    const short = wallet.length > 12 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
    this.add
      .text(VIEW_W / 2, uiDim(88), `ONE-TIME CREATION  ·  bound to wallet ${short}  ·  ${this.classDef.name}`, {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(13),
        color: "#f7ff3c",
      })
      .setOrigin(0.5);

    const pg = this.add.graphics();
    const py = uiDim(120);
    const ph = VIEW_H - py - uiDim(80);
    pg.fillStyle(0x0b0716, 0.88).fillRect(this.previewX, py, this.previewW, ph);
    pg.lineStyle(uiDim(2), this.classDef.color, 0.75).strokeRect(this.previewX, py, this.previewW, ph);
    pg.fillStyle(0x05060f, 0.9).fillEllipse(this.previewX + this.previewW / 2, py + ph - uiDim(36), uiDim(180), uiDim(36));

    this.preview = this.add.container(0, 0);
    this.makeCallsignField();
    this.defineRows();
    this.bakeAndRefresh();
    this.renderRows();

    const back = this.add
      .text(MENU_PAD, MENU_FOOTER_Y, "◀ BACK", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(15),
        color: "#9aa3b2",
      })
      .setInteractive({ useHandCursor: true });
    back.on("pointerover", () => back.setColor("#eafdff"));
    back.on("pointerout", () => back.setColor("#9aa3b2"));
    back.on("pointerdown", () => this.goBack());

    const confirm = this.add
      .text(VIEW_W - MENU_PAD, MENU_FOOTER_Y, "LOCK IN & DEPLOY ▶", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(16),
        color: "#39ff88",
        fontStyle: "bold",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    confirm.on("pointerover", () => confirm.setColor("#eafdff"));
    confirm.on("pointerout", () => confirm.setColor("#39ff88"));
    confirm.on("pointerdown", () => this.confirm());

    this.add
      .text(VIEW_W / 2, MENU_FOOTER_Y, "TYPE callsign · ↑↓ row · ←→ option · ENTER to lock in", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(11),
        color: "#6b7184",
      })
      .setOrigin(0.5);

    this.setupInput();
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
        value: () => SKIN_TONES.find((s) => s.value === this.cust.skin)?.name ?? "SYNTH",
        swatch: () => (this.cust.skin >= 0 ? this.cust.skin : 0x2a2a3a),
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
        label: "HEADGEAR",
        value: () => HEAD_LABELS[this.cust.head],
        cycle: (d) => {
          this.cust.head = cycleIn(CUSTOM_HEADS, this.cust.head, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "OPTIC",
        value: () => VISOR_LABELS[this.cust.visor],
        cycle: (d) => {
          this.cust.visor = cycleIn(CUSTOM_VISORS, this.cust.visor, d);
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
    const y = uiDim(128);
    const h = uiDim(32);
    const g = this.add.graphics();
    g.fillStyle(0x0b0716, 0.9).fillRect(x, y, w, h);
    g.lineStyle(uiDim(2), 0x00e5ff, 0.7).strokeRect(x, y, w, h);
    g.fillStyle(0x00e5ff, 0.9).fillRect(x, y, uiDim(4), h);
    this.add
      .text(x + uiDim(14), y + h / 2, "CALLSIGN", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(12),
        color: "#6b7184",
      })
      .setOrigin(0, 0.5);
    this.callsignText = this.add
      .text(x + w - uiDim(14), y + h / 2, "", {
        fontFamily: "Courier New, monospace",
        fontSize: uiFont(18),
        color: "#eafdff",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);
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
    this.callsignText.setText((this.cust.callsign || "") + (this.caretOn ? "_" : " "));
  }

  private bakeAndRefresh() {
    bakeCustomPlayer(this, this.cust);
    this.preview.removeAll(true);
    const cx = this.previewX + this.previewW / 2;
    const cy = uiDim(120) + (VIEW_H - uiDim(200)) * 0.42;
    const hero = this.add.image(cx, cy, PLAYER_CUSTOM_KEY, 0).setScale(8.5 * UI_SCALE);
    this.preview.add(hero);
    const facings = [1 * 4, 3 * 4, 2 * 4];
    facings.forEach((f, i) => {
      const img = this.add
        .image(cx - uiDim(100) + i * uiDim(100), cy + uiDim(140), PLAYER_CUSTOM_KEY, f)
        .setScale(3.6 * UI_SCALE)
        .setAlpha(0.92);
      this.preview.add(img);
    });
  }

  private renderRows() {
    this.rowG = this.add.graphics();
    this.rows.forEach((row, i) => {
      const y = this.rowTop + i * this.rowH;
      this.rowTexts.push(
        this.add
          .text(this.panelX + uiDim(16), y, row.label, {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(14),
            color: "#9aa3b2",
          })
          .setOrigin(0, 0.5),
      );
      this.rowValTexts.push(
        this.add
          .text(VIEW_W - MENU_PAD - uiDim(48), y, "", {
            fontFamily: "Courier New, monospace",
            fontSize: uiFont(14),
            color: "#eafdff",
          })
          .setOrigin(1, 0.5),
      );
      const sw = this.add
        .rectangle(VIEW_W - MENU_PAD - uiDim(28), y, uiDim(16), uiDim(16), 0xffffff)
        .setStrokeStyle(uiDim(1), 0x000000, 0.6);
      sw.setVisible(false);
      this.rowSwatches.push(sw);

      const left = this.add
        .text(this.panelX + uiDim(180), y, "◀", { fontFamily: "monospace", fontSize: uiFont(16), color: "#6b7184" })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      const right = this.add
        .text(VIEW_W - MENU_PAD - uiDim(8), y, "▶", { fontFamily: "monospace", fontSize: uiFont(16), color: "#6b7184" })
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
      this.add
        .zone(this.panelX + uiDim(8), y - this.rowH / 2, this.panelW - uiDim(16), this.rowH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.rowIndex = i;
          this.renderRowValues();
        });
    });
    this.renderRowValues();
  }

  private renderRowValues() {
    this.rowG.clear();
    const listH = this.rows.length * this.rowH + uiDim(20);
    this.rowG.fillStyle(0x0b0716, 0.6).fillRect(this.panelX, this.rowTop - uiDim(18), this.panelW, listH);
    this.rowG.lineStyle(uiDim(1), this.classDef.color, 0.45).strokeRect(this.panelX, this.rowTop - uiDim(18), this.panelW, listH);
    this.rows.forEach((row, i) => {
      const y = this.rowTop + i * this.rowH;
      const selected = i === this.rowIndex;
      if (selected) {
        this.rowG.fillStyle(this.classDef.color, 0.14).fillRect(this.panelX + uiDim(8), y - this.rowH / 2 + uiDim(4), this.panelW - uiDim(16), this.rowH - uiDim(8));
        this.rowG.lineStyle(uiDim(2), this.classDef.color, 0.9).strokeRect(this.panelX + uiDim(8), y - this.rowH / 2 + uiDim(4), this.panelW - uiDim(16), this.rowH - uiDim(8));
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
          this.renderRowValues();
          break;
        case "ArrowDown":
          this.rowIndex = (this.rowIndex + 1) % this.rows.length;
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

  private applyNeon() {
    if (this.renderer.type !== Phaser.WEBGL) return;
    const cam = this.cameras.main;
    cam.setPostPipeline("Neon");
    const p = cam.getPostPipeline("Neon");
    this.neon = (Array.isArray(p) ? p[0] : p) as NeonPipeline;
    if (this.neon) {
      this.neon.heat = 0.08;
      this.neon.tint = [0, 0.9, 1];
      this.neon.tintAmt = 0.12;
    }
  }

  private goBack() {
    this.cameras.main.fadeOut(250, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Select"));
  }

  private confirm() {
    if (!this.cust.callsign) this.cust.callsign = randomCallsign();
    this.registry.set("classId", this.classDef.id);
    this.registry.set("customization", this.cust);
    this.registry.set("resume", false);
    this.registry.set("characterLocked", true);
    this.cameras.main.fadeOut(350, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Prologue"));
  }
}
import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
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

interface Row {
  label: string;
  value: () => string;
  swatch?: () => number; // optional colour chip beside the value
  cycle: (dir: number) => void; // change the value (and re-bake if structural)
}

/**
 * Character customizer. Select -> Customize -> Game. Tunes the player's signature
 * colour + silhouette (build / headgear / optic / accents) with a live preview
 * baked from the parametric drawCharacter(). Confirms into the registry, then the
 * Game scene bakes + tints the final sprite.
 */
export default class CustomizeScene extends Phaser.Scene {
  private classDef!: ClassDef;
  private cust!: Customization;
  private rowIndex = 0;
  private rows: Row[] = [];
  private neon?: NeonPipeline;

  private preview!: Phaser.GameObjects.Container; // re-populated on each re-bake
  private callsignText!: Phaser.GameObjects.Text;
  private caretOn = true;
  private rowG!: Phaser.GameObjects.Graphics;
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private rowValTexts: Phaser.GameObjects.Text[] = [];
  private rowSwatches: Phaser.GameObjects.Rectangle[] = [];

  private readonly panelX = 470;
  private readonly rowTop = 118;
  private readonly rowH = 26;

  constructor() {
    super("Customize");
  }

  create() {
    this.classDef = getClass(this.registry.get("classId") as string | undefined);
    this.cust = defaultCustomization(this.classDef.id);

    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    this.cameras.main.fadeIn(350, 2, 2, 8);
    MusicDirector.for(this)?.play("menu", this); // same bed as the title flow
    this.applyNeon();

    this.add
      .text(VIEW_W / 2, 30, "CUSTOMIZE YOUR CYBERIAN", {
        fontFamily: "Courier New, monospace",
        fontSize: "24px",
        color: "#00e5ff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#ff2bd6", 5, true, true);
    this.add
      .text(VIEW_W / 2, 54, `${this.classDef.name} · ${this.classDef.primaryName}`, {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: this.classDef.hex,
      })
      .setOrigin(0.5);

    // ── preview pedestal (left) ──────────────────────────────────────
    const pg = this.add.graphics();
    pg.fillStyle(0x0b0716, 0.85).fillRect(40, 84, 380, 392);
    pg.lineStyle(2, this.classDef.color, 0.7).strokeRect(40, 84, 380, 392);
    pg.fillStyle(0x05060f, 0.9).fillEllipse(230, 366, 150, 30); // floor
    this.preview = this.add.container(0, 0);

    this.makeCallsignField();
    this.defineRows();
    this.bakeAndRefresh();
    this.renderRows();

    // ── footer hints + buttons ───────────────────────────────────────
    const back = this.add
      .text(70, VIEW_H - 26, "◀ BACK", {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: "#9aa3b2",
      })
      .setInteractive({ useHandCursor: true });
    back.on("pointerover", () => back.setColor("#eafdff"));
    back.on("pointerout", () => back.setColor("#9aa3b2"));
    back.on("pointerdown", () => this.goBack());

    const confirm = this.add
      .text(VIEW_W - 70, VIEW_H - 26, "DEPLOY ▶", {
        fontFamily: "Courier New, monospace",
        fontSize: "15px",
        color: "#39ff88",
        fontStyle: "bold",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    confirm.on("pointerover", () => confirm.setColor("#eafdff"));
    confirm.on("pointerout", () => confirm.setColor("#39ff88"));
    confirm.on("pointerdown", () => this.confirm());

    this.add
      .text(VIEW_W / 2, VIEW_H - 24, "TYPE callsign · ↑↓ select · ←→ change · ENTER deploy · ESC back", {
        fontFamily: "Courier New, monospace",
        fontSize: "10px",
        color: "#6b7184",
      })
      .setOrigin(0.5);

    this.setupInput();
  }

  // ── option model ───────────────────────────────────────────────────
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
          this.bakeAndRefresh(); // colour is baked into the sprite now — re-bake
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
        label: "SEX",
        value: () => SEX_LABELS[this.cust.sex],
        cycle: (d) => {
          this.cust.sex = cycleIn(CUSTOM_SEXES, this.cust.sex, d);
          this.bakeAndRefresh();
        },
      },
      {
        label: "SKIN",
        value: () => SKIN_TONES.find((s) => s.value === this.cust.skin)?.name ?? "SYNTH",
        swatch: () => (this.cust.skin >= 0 ? this.cust.skin : 0x2a2a3a),
        cycle: (d) => {
          const i = Math.max(
            0,
            SKIN_TONES.findIndex((s) => s.value === this.cust.skin),
          );
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
          const i = Math.max(
            0,
            HAIR_COLORS.findIndex((c) => c.value === this.cust.hairColor),
          );
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

  // ── callsign field (keyboard-captured, with a blinking caret) ────────
  private makeCallsignField() {
    const x = this.panelX;
    const w = VIEW_W - this.panelX - 40;
    const y = 82;
    const h = 24;
    const g = this.add.graphics();
    g.fillStyle(0x0b0716, 0.85).fillRect(x, y, w, h);
    g.lineStyle(2, 0x00e5ff, 0.65).strokeRect(x, y, w, h);
    g.fillStyle(0x00e5ff, 0.9).fillRect(x, y, 3, h); // accent tab
    this.add
      .text(x + 12, y + h / 2, "CALLSIGN", {
        fontFamily: "Courier New, monospace",
        fontSize: "11px",
        color: "#6b7184",
      })
      .setOrigin(0, 0.5);
    this.callsignText = this.add
      .text(x + w - 12, y + h / 2, "", {
        fontFamily: "Courier New, monospace",
        fontSize: "15px",
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

  // ── preview ─────────────────────────────────────────────────────────
  /** Re-bake the sprite from the current spec, then rebuild the preview images. */
  private bakeAndRefresh() {
    bakeCustomPlayer(this, this.cust); // baked in final colours — no in-scene tint
    this.preview.removeAll(true);
    // big hero (down-facing) + a row of the other facings beneath
    const hero = this.add.image(230, 250, PLAYER_CUSTOM_KEY, 0).setScale(7);
    this.preview.add(hero);
    // Neutral-stance frame per facing in the new 4×WALK_STEPS sheet: left/up/right.
    const facings = [1 * 4, 3 * 4, 2 * 4];
    facings.forEach((f, i) => {
      const img = this.add.image(150 + i * 80, 400, PLAYER_CUSTOM_KEY, f).setScale(3).setAlpha(0.92);
      this.preview.add(img);
    });
  }

  // ── option rows render ──────────────────────────────────────────────
  private renderRows() {
    this.rowG = this.add.graphics();
    this.rows.forEach((row, i) => {
      const y = this.rowTop + i * this.rowH;
      this.rowTexts.push(
        this.add
          .text(this.panelX + 16, y, row.label, {
            fontFamily: "Courier New, monospace",
            fontSize: "13px",
            color: "#9aa3b2",
          })
          .setOrigin(0, 0.5),
      );
      this.rowValTexts.push(
        this.add
          .text(VIEW_W - 70, y, "", {
            fontFamily: "Courier New, monospace",
            fontSize: "13px",
            color: "#eafdff",
          })
          .setOrigin(1, 0.5),
      );
      const sw = this.add.rectangle(VIEW_W - 56, y, 14, 14, 0xffffff).setStrokeStyle(1, 0x000000, 0.6);
      sw.setVisible(false);
      this.rowSwatches.push(sw);

      // clickable arrows
      const left = this.add
        .text(this.panelX + 150, y, "◀", { fontFamily: "monospace", fontSize: "14px", color: "#6b7184" })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      const right = this.add
        .text(VIEW_W - 30, y, "▶", { fontFamily: "monospace", fontSize: "14px", color: "#6b7184" })
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
      // selecting the row by clicking its label area
      this.add
        .zone(this.panelX + 8, y - this.rowH / 2, VIEW_W - 70 - (this.panelX + 8), this.rowH)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.rowIndex = i;
          this.renderRowValues();
        });
    });
    this.renderRowValues();
  }

  /** Redraw the row values + selection highlight (cheap; called on every change). */
  private renderRowValues() {
    this.rowG.clear();
    this.rowG.fillStyle(0x0b0716, 0.55).fillRect(this.panelX, 108, VIEW_W - this.panelX - 40, this.rows.length * this.rowH + 16);
    this.rowG.lineStyle(1, this.classDef.color, 0.4).strokeRect(this.panelX, 108, VIEW_W - this.panelX - 40, this.rows.length * this.rowH + 16);
    this.rows.forEach((row, i) => {
      const y = this.rowTop + i * this.rowH;
      const selected = i === this.rowIndex;
      if (selected) {
        this.rowG.fillStyle(this.classDef.color, 0.14).fillRect(this.panelX + 6, y - this.rowH / 2 + 4, VIEW_W - this.panelX - 52, this.rowH - 8);
        this.rowG.lineStyle(2, this.classDef.color, 0.9).strokeRect(this.panelX + 6, y - this.rowH / 2 + 4, VIEW_W - this.panelX - 52, this.rowH - 8);
      }
      this.rowTexts[i].setColor(selected ? "#eafdff" : "#9aa3b2");
      const sw = this.rowSwatches[i];
      if (row.swatch) {
        sw.setVisible(true).setFillStyle(row.swatch());
        this.rowValTexts[i].setText(row.value()).setX(VIEW_W - 78);
      } else {
        sw.setVisible(false);
        this.rowValTexts[i].setText(row.value()).setX(VIEW_W - 56);
      }
    });
  }

  // ── input ───────────────────────────────────────────────────────────
  private setupInput() {
    this.input.keyboard?.on("keydown", (e: KeyboardEvent) => {
      // Callsign editing: typed characters fill the field; backspace deletes.
      // (Letters can't double as nav here, so only the arrow keys move/change rows.)
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
      this.neon.heat = 0.08; // keep the menu cool so option text stays crisp
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
    this.cameras.main.fadeOut(350, 2, 2, 8);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Prologue"));
  }
}

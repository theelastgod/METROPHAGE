// METROPHAGE — the cold open. First boot only: no menu, no reading. You wake mid-
// reprint in a service alley, two HSS units walk in, and you learn the whole game —
// move, aim, kill — inside thirty seconds. Then THE FIXER's voice gives you the hook
// and the title screen finally appears, already meaning something.
//
// Entirely client-side (no server, no persistence beyond the seen-flag), skippable
// (ESC or the SKIP chip), and never shown again once finished or skipped.

import Phaser from "phaser";
import { COLORS, TILE, VIEW_W, VIEW_H, uiDim } from "../config";
import { GLOW_KEY, PLAYER_KEY, COP_KEY } from "../assets/manifest";
import { driveChar } from "../assets/anim";
import { displayFont, bodyFont } from "../ui/typography";
import { createTerrainLayer } from "../render/terrainLayer";
import { buildSafehouse } from "../world/district";
import Synth from "../audio/Synth";
import { playCombatPose } from "../assets/combatAnim";

export const COLD_OPEN_SEEN_KEY = "metrophage_coldopen_v1";

export function coldOpenSeen(): boolean {
  try {
    return localStorage.getItem(COLD_OPEN_SEEN_KEY) === "1";
  } catch {
    return true; // no storage — never trap the player in an unskippable intro loop
  }
}

function markSeen() {
  try {
    localStorage.setItem(COLD_OPEN_SEEN_KEY, "1");
  } catch {
    /* fine */
  }
}

interface Hostile {
  s: Phaser.GameObjects.Sprite;
  hp: number;
}

export default class ColdOpenScene extends Phaser.Scene {
  private me!: Phaser.GameObjects.Sprite;
  private hostiles: Hostile[] = [];
  private shots: Array<{ g: Phaser.GameObjects.Image; vx: number; vy: number; born: number }> = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private synth?: Synth;
  private phase: "wake" | "fight" | "voice" | "out" = "wake";
  private caption!: Phaser.GameObjects.Text;
  private fired = false;

  constructor() {
    super("ColdOpen");
  }

  create() {
    markSeen(); // even a mid-intro refresh must not loop the intro
    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    this.synth = this.registry.get("synth") as Synth | undefined; // shared — do not dispose

    // the alley — a small interior slice of the real city tileset
    const grid = buildSafehouse();
    createTerrainLayer(this, grid, { profile: "interior", accent: 0x39ff88 });
    const cx = 10 * TILE;
    const cy = 8 * TILE;
    this.me = this.add.sprite(cx, cy, PLAYER_KEY, 0).setDepth(10).setAlpha(0);
    this.add.image(cx, cy + 12, GLOW_KEY).setTint(0x000006).setAlpha(0.4).setScale(0.52, 0.22).setDepth(7.5);
    this.cameras.main.startFollow(this.me, true, 0.15, 0.15);
    this.cameras.main.setZoom(2);

    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,LEFT,DOWN,RIGHT") as Record<string, Phaser.Input.Keyboard.Key>;

    // skip affordances — ESC or the chip, both jump straight to the menu
    const skip = this.add
      .text(VIEW_W - uiDim(18), uiDim(14), "SKIP ▸", displayFont(11, { color: "#6b7184" }))
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });
    skip.on("pointerdown", () => this.finish());
    this.input.keyboard!.on("keydown-ESC", () => this.finish());

    this.caption = this.add
      .text(VIEW_W / 2, VIEW_H * 0.72, "", bodyFont(15, { color: "#eafdff", align: "center", fontStyle: "bold" }))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100)
      .setShadow(0, 2, "#05060f", 6, true, true);

    // ── beat 1: SIGNAL LOST → reprint → eyes open ────────────────────────────
    const black = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x020108).setOrigin(0).setScrollFactor(0).setDepth(90);
    const sig = this.add
      .text(VIEW_W / 2, VIEW_H * 0.42, "SIGNAL LOST", displayFont(34, { color: "#ff3b6b", fontStyle: "bold" }))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(95)
      .setShadow(0, 0, "#ff3b6b", 18, true, true);
    this.time.delayedCall(1100, () => {
      sig.setText("REPRINT 47 — COMPLETE").setColor("#9aa3b2").setShadow(0, 0, "#000000", 0);
      this.synth?.iceShatter();
    });
    this.time.delayedCall(2300, () => {
      sig.destroy();
      this.tweens.add({ targets: black, alpha: 0, duration: 700, onComplete: () => black.destroy() });
      this.tweens.add({ targets: this.me, alpha: 1, duration: 500 });
      this.caption.setText("They printed you a new body.\nSame debt. Same name on the warrant.");
      this.phase = "fight";
      this.time.delayedCall(1400, () => this.spawnHostiles());
    });
  }

  private spawnHostiles() {
    this.caption.setText("WASD — move    ·    CLICK — fire");
    for (const dx of [-160, 170]) {
      const s = this.add.sprite(this.me.x + dx, this.me.y - 90, COP_KEY, 0).setDepth(9).setAlpha(0);
      this.tweens.add({ targets: s, alpha: 1, duration: 300 });
      this.hostiles.push({ s, hp: 3 });
    }
    this.synth?.shoot();
    this.input.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      if (this.phase !== "fight") return;
      this.fired = true;
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      const aim = Math.atan2(wp.y - this.me.y, wp.x - this.me.x);
      const g = this.add
        .image(this.me.x, this.me.y, GLOW_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0x39ff88)
        .setScale(0.16)
        .setDepth(11);
      this.shots.push({ g, vx: Math.cos(aim) * 560, vy: Math.sin(aim) * 560, born: this.time.now });
      this.synth?.shoot();
    });
  }

  update(_t: number, dtMs: number) {
    const dt = dtMs / 1000;
    if (this.phase === "fight" || this.phase === "voice") {
      // free movement the moment you can see
      let mx = 0;
      let my = 0;
      if (this.keys.A?.isDown || this.keys.LEFT?.isDown) mx -= 1;
      if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) mx += 1;
      if (this.keys.W?.isDown || this.keys.UP?.isDown) my -= 1;
      if (this.keys.S?.isDown || this.keys.DOWN?.isDown) my += 1;
      const moving = mx !== 0 || my !== 0;
      if (moving) {
        const n = Math.hypot(mx, my);
        this.me.x += (mx / n) * 190 * dt;
        this.me.y += (my / n) * 190 * dt;
        if (this.fired === false && this.caption.text.startsWith("They printed")) {
          this.caption.setText("WASD — move    ·    CLICK — fire");
        }
      }
      driveChar(this.me, mx, my, moving);
    }

    // hostiles shamble toward you (they never kill you here — this beat is YOURS)
    for (const h of this.hostiles) {
      if (h.hp <= 0) continue;
      const dx = this.me.x - h.s.x;
      const dy = this.me.y - h.s.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 40) {
        h.s.x += (dx / d) * 70 * dt;
        h.s.y += (dy / d) * 70 * dt;
      }
      driveChar(h.s, dx, dy, d > 40);
    }

    // client-sim shots
    for (const sh of [...this.shots]) {
      sh.g.x += sh.vx * dt;
      sh.g.y += sh.vy * dt;
      let dead = this.time.now - sh.born > 900;
      for (const h of this.hostiles) {
        if (h.hp <= 0) continue;
        if (Math.hypot(h.s.x - sh.g.x, h.s.y - sh.g.y) < 22) {
          h.hp--;
          dead = true;
          this.cameras.main.shake(50, 0.002);
          playCombatPose(h.s, h.hp <= 0 ? "dead" : "hit");
          this.synth?.hit();
          if (h.hp <= 0) {
            this.synth?.kill();
            this.cameras.main.shake(90, 0.004);
          }
          break;
        }
      }
      if (dead) {
        sh.g.destroy();
        this.shots.splice(this.shots.indexOf(sh), 1);
      }
    }

    // both down → the FIXER's voice, then out
    if (this.phase === "fight" && this.hostiles.length === 2 && this.hostiles.every((h) => h.hp <= 0)) {
      this.phase = "voice";
      this.synth?.infect();
      const lines = [
        "— There you are. Same eyes. Different body.",
        "— They bill the reprint to YOUR account, you know.",
        "— I'm at the safehouse. Come angry. We're getting it back.",
      ];
      let i = 0;
      this.caption.setColor("#f7ff3c").setText(lines[0]);
      const nextLine = () => {
        i++;
        if (i < lines.length) {
          this.caption.setText(lines[i]);
          this.time.delayedCall(2100, nextLine);
        } else {
          this.finish();
        }
      };
      this.time.delayedCall(2100, nextLine);
    }
  }

  private finish() {
    if (this.phase === "out") return;
    this.phase = "out";
    markSeen();
    this.cameras.main.fadeOut(420, 2, 2, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("Select");
    });
  }
}

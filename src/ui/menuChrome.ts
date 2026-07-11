import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "../config";
import { GLOW_KEY, MENU_BG_KEY } from "../assets/manifest";
import { uiDim } from "./uiLayout";

/** Painted key art + faint grid + vignette used by title / prologue / customize screens. */
export function drawMenuBackdrop(scene: Phaser.Scene, depth = 0): Phaser.GameObjects.Graphics {
  const base = scene.add.graphics().setDepth(depth);
  base.fillStyle(COLORS.bgVoid, 1).fillRect(0, 0, VIEW_W, VIEW_H);

  // painted city key art (Higgsfield) under the procedural chrome — cover-fit and
  // dimmed so menu text keeps contrast; the art is authored dark in the center.
  const hasArt = scene.textures.exists(MENU_BG_KEY);
  if (hasArt) {
    const img = scene.add.image(VIEW_W / 2, VIEW_H / 2, MENU_BG_KEY).setDepth(depth);
    img.setScale(Math.max(VIEW_W / img.width, VIEW_H / img.height)).setAlpha(0.85);
  }

  const g = scene.add.graphics().setDepth(depth);
  if (hasArt) g.fillStyle(0x04020a, 0.38).fillRect(0, 0, VIEW_W, VIEW_H);

  const step = uiDim(32);
  g.lineStyle(1, 0x1b2740, hasArt ? 0.16 : 0.38);
  for (let x = 0; x <= VIEW_W; x += step) g.lineBetween(x, 0, x, VIEW_H);
  for (let y = 0; y <= VIEW_H; y += step) g.lineBetween(0, y, VIEW_W, y);

  // soft radial mood wash — breaks flat void
  g.fillStyle(0x120a24, 0.22).fillCircle(VIEW_W * 0.5, VIEW_H * 0.42, VIEW_W * 0.38);
  g.fillStyle(0x0a1830, 0.16).fillCircle(VIEW_W * 0.72, VIEW_H * 0.58, VIEW_W * 0.28);

  const pad = uiDim(48);
  g.fillStyle(0x02020a, hasArt ? 0.6 : 0.42).fillRect(0, 0, VIEW_W, pad);
  g.fillStyle(0x02020a, hasArt ? 0.66 : 0.5).fillRect(0, VIEW_H - pad, VIEW_W, pad);
  return g;
}

/**
 * Living menu atmosphere — rain streaks, drifting holo motes, slow scan sweep.
 * Backdrop layer (scrollFactor 1) so neon post-FX blooms the world, not the UI.
 */
export class MenuAtmosphere {
  private rain: Phaser.GameObjects.Graphics;
  private sweep: Phaser.GameObjects.Graphics;
  private motes: Phaser.GameObjects.Image[] = [];
  private t = 0;

  constructor(scene: Phaser.Scene, depth = 1) {
    this.rain = scene.add.graphics().setDepth(depth);
    this.sweep = scene.add.graphics().setDepth(depth + 0.1);

    const cols = [0x29e7ff, 0xff2bd6, 0x39ff88, 0xf7ff3c, 0xb06bff];
    for (let i = 0; i < 14; i++) {
      const x = (i * 173 + 41) % VIEW_W;
      const y = (i * 97 + 23) % VIEW_H;
      const m = scene.add
        .image(x, y, GLOW_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(cols[i % cols.length])
        .setDepth(depth + 0.05)
        .setScale(0.35 + (i % 5) * 0.08)
        .setAlpha(0.08 + (i % 4) * 0.03);
      this.motes.push(m);
      scene.tweens.add({
        targets: m,
        x: x + Phaser.Math.Between(-80, 80),
        y: y + Phaser.Math.Between(-40, 40),
        alpha: m.alpha * 0.55,
        duration: 4200 + i * 320,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut",
      });
    }

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    });
  }

  private tick(_t: number, dt: number) {
    this.t += dt * 0.001;
    this.drawRain();
    this.drawSweep();
  }

  private drawRain() {
    const g = this.rain;
    g.clear();
    g.lineStyle(1, 0x6a8ab8, 0.14);
    for (let i = 0; i < 48; i++) {
      const seed = i * 991 + 17;
      const x = ((seed * 13 + this.t * 120) % (VIEW_W + 40)) - 20;
      const y = ((seed * 7 + this.t * 280) % (VIEW_H + 60)) - 30;
      g.lineBetween(x, y, x - 2, y + 10);
    }
  }

  private drawSweep() {
    const g = this.sweep;
    g.clear();
    const y = ((this.t * 42) % (VIEW_H + uiDim(80))) - uiDim(40);
    g.fillStyle(0x00e5ff, 0.04).fillRect(0, y, VIEW_W, uiDim(3));
    g.fillStyle(0xff2bd6, 0.025).fillRect(0, y + uiDim(6), VIEW_W, uiDim(1));
  }
}

/** Preview pedestal under character creator / class cards. */
export function drawPreviewPedestal(scene: Phaser.Scene, cx: number, cy: number, accent: number, depth = 8): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(depth);
  const w = uiDim(120);
  const h = uiDim(18);
  g.fillStyle(0x0a0e18, 0.75).fillEllipse(cx, cy, w, h);
  g.lineStyle(1, accent, 0.45).strokeEllipse(cx, cy, w, h);
  g.lineStyle(2, accent, 0.2).strokeEllipse(cx, cy, w * 0.72, h * 0.55);
  scene.add
    .image(cx, cy - uiDim(2), GLOW_KEY)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setTint(accent)
    .setDepth(depth - 1)
    .setScale(2.4)
    .setAlpha(0.12);
  return g;
}

export const MENU_PAD = uiDim(44);
export const MENU_HEADER_Y = uiDim(56);
export const MENU_SUB_Y = uiDim(104);
export const MENU_SECTION_GAP = uiDim(16);
export const MENU_FOOTER_H = uiDim(56);
export const MENU_FOOTER_Y = VIEW_H - MENU_FOOTER_H;
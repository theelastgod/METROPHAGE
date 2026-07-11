import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";
import { getSettings } from "../systems/Settings";
import { VIEW_W, VIEW_H } from "../config";
import type { Weather } from "../game/districts";

// METROPHAGE — atmospheric layer. Per-district weather (screen-space particle field),
// drifting world-space fog banks, and animated holographic signage. Pure ambiance: no
// gameplay, no collision. Respects the accessibility settings (low-FX thins the field;
// reduce-flashing damps the holo flicker). Built once per district in GameScene.create.

const RAIN_KEY = "fx_rain";
const MOTE_KEY = "fx_mote";

/** Bake the two tiny FX textures (streak + soft mote) once. */
function ensureTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists(RAIN_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 0.35).fillRect(0, 0, 1, 22);
    g.fillStyle(0xffffff, 0.9).fillRect(1, 0, 1, 18);
    g.fillStyle(0xffffff, 0.5).fillRect(2, 2, 1, 14);
    g.generateTexture(RAIN_KEY, 3, 22);
    g.destroy();
  }
  if (!scene.textures.exists(MOTE_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 0.25).fillCircle(4, 4, 4);
    g.fillStyle(0xffffff, 0.85).fillCircle(4, 4, 2);
    g.generateTexture(MOTE_KEY, 8, 8);
    g.destroy();
  }
}

const cssHex = (c: number) => "#" + (c & 0xffffff).toString(16).padStart(6, "0");

/** Holographic glyphs — terse cyberpunk signage drifting above the rooftops. */
const HOLO_GLYPHS = ["システム", "0x7F", "▲HELIOS", "株式", "PALANTIR", "デ", "SEC//", "監視", "未来", "ナ"];

/** A single floating holographic billboard: a projector dot, a beam, a flickering
 *  panel with a glyph + scanlines. Animated (flicker + scanline scroll). */
class Hologram {
  private container: Phaser.GameObjects.Container;
  private scan: Phaser.GameObjects.Rectangle;
  private seed = Math.random() * Math.PI * 2;

  constructor(scene: Phaser.Scene, x: number, y: number, color: number) {
    scene.add.circle(x, y, 3, color, 0.85).setDepth(6); // projector base on the roof
    const beam = scene.add
      .triangle(0, 0, -9, 0, 9, 0, 0, -48, color, 0.1)
      .setBlendMode(Phaser.BlendModes.ADD);
    const panel = scene.add
      .rectangle(0, -54, 34, 24, color, 0.16)
      .setStrokeStyle(1, color, 0.75);
    const glyph = scene.add
      .text(0, -54, HOLO_GLYPHS[Math.floor(Math.random() * HOLO_GLYPHS.length)], {
        fontFamily: "Courier New, monospace",
        fontSize: "13px",
        color: cssHex(color),
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.scan = scene.add.rectangle(0, -62, 32, 2, 0xffffff, 0.25); // travelling scanline
    this.container = scene.add.container(x, y, [beam, panel, glyph, this.scan]).setDepth(7);
  }

  update(now: number, reduceFlashing: boolean) {
    // Gentle flicker, with the occasional dropout — damped hard under reduce-flashing.
    const wobble = 0.78 + 0.18 * Math.sin(now * 0.02 + this.seed);
    const dropout = !reduceFlashing && Math.random() < 0.035 ? 0.45 : 1;
    this.container.setAlpha(Phaser.Math.Clamp(wobble * dropout, reduceFlashing ? 0.6 : 0.25, 1));
    // Scanline crawls up the panel.
    this.scan.y = -66 + ((now * 0.03 + this.seed * 20) % 26);
  }
}

interface FogBank {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  baseAlpha: number;
  seed: number;
}

export default class Atmosphere {
  private scene: Phaser.Scene;
  private worldW: number;
  private worldH: number;
  private holos: Hologram[] = [];
  private fog: FogBank[] = [];
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private reduceFlashing: boolean;

  constructor(
    scene: Phaser.Scene,
    opts: { weather?: Weather; accent: number; worldW: number; worldH: number },
  ) {
    this.scene = scene;
    this.worldW = opts.worldW;
    this.worldH = opts.worldH;
    this.reduceFlashing = getSettings().reduceFlashing;
    ensureTextures(scene);
    this.buildWeather(opts.weather ?? "rain", opts.accent);
    this.buildFog(opts.accent, opts.weather ?? "rain");
    this.buildHighFog(opts.accent);
  }

  /** High fog — banks ABOVE the street, on a >1 scroll factor so they slide faster
   *  than the ground when the camera moves. Free-floating, so the parallax
   *  displacement is pure depth cue (nothing they must stay aligned with). */
  private buildHighFog(accent: number) {
    if (getSettings().lowFx) return;
    for (let i = 0; i < 3; i++) {
      const img = this.scene.add
        .image(Math.random() * this.worldW, Math.random() * this.worldH, GLOW_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(i === 0 ? accent : 0x8fa9c8)
        .setScale(8 + Math.random() * 6, 4 + Math.random() * 3)
        .setAlpha(0.045)
        .setScrollFactor(1.14)
        .setDepth(13);
      this.fog.push({
        img,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.5) * 6,
        baseAlpha: 0.045,
        seed: Math.random() * Math.PI * 2,
      });
    }
  }

  /** Place an animated holographic sign at a world point (GameScene seeds rooftops). */
  addHologram(x: number, y: number, color: number) {
    this.holos.push(new Hologram(this.scene, x, y, color));
  }

  private buildWeather(weather: Weather, accent: number) {
    const lowFx = getSettings().lowFx;
    const add = (key: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth: number) => {
      const e = this.scene.add.particles(0, 0, key, cfg).setScrollFactor(0).setDepth(depth);
      this.emitters.push(e);
    };

    if (weather === "rain") {
      // FAR rain — smaller, slower, dimmer: a second sheet behind the near one.
      // Two speeds of the same weather is the cheapest depth cue there is.
      if (!lowFx)
        add(RAIN_KEY, {
          x: { min: -60, max: VIEW_W + 60 },
          y: -20,
          lifespan: 1350,
          speedY: { min: 420, max: 540 },
          speedX: { min: 36, max: 80 },
          scaleX: 0.6,
          scaleY: { min: 0.35, max: 0.6 },
          alpha: { start: 0.26, end: 0 },
          tint: 0x6fa8cc,
          quantity: 3,
          frequency: 16,
        }, 940);
      add(RAIN_KEY, {
        x: { min: -60, max: VIEW_W + 60 },
        y: -20,
        lifespan: 850,
        speedY: { min: 780, max: 1000 },
        speedX: { min: 70, max: 150 }, // wind slant
        scaleX: 1,
        scaleY: { min: 0.7, max: 1.4 },
        alpha: { start: 0.5, end: 0 },
        tint: 0x9fdcff,
        quantity: lowFx ? 2 : 5,
        frequency: 12,
      }, 950);
    } else if (weather === "ash") {
      add(MOTE_KEY, {
        x: { min: -10, max: VIEW_W + 10 },
        y: -10,
        lifespan: 6000,
        speedY: { min: 28, max: 66 },
        speedX: { min: -22, max: 22 },
        accelerationX: { min: -10, max: 10 },
        scale: { min: 0.4, max: 1.1 },
        alpha: { start: 0.55, end: 0.05 },
        tint: 0xc3ccd9,
        quantity: lowFx ? 1 : 2,
        frequency: 55,
      }, 950);
    } else if (weather === "embers") {
      add(MOTE_KEY, {
        x: { min: 0, max: VIEW_W },
        y: VIEW_H + 10,
        lifespan: { min: 2600, max: 4400 },
        speedY: { min: -96, max: -42 },
        speedX: { min: -20, max: 20 },
        accelerationX: { min: -14, max: 14 },
        scale: { min: 0.3, max: 0.95 },
        alpha: { start: 0.95, end: 0 },
        tint: accent === 0xff3b6b ? 0xff7a3c : accent,
        quantity: lowFx ? 1 : 2,
        frequency: 60,
        blendMode: Phaser.BlendModes.ADD,
      }, 950);
    } else {
      // smog — slow drifting haze motes (the heavier banks come from buildFog)
      add(MOTE_KEY, {
        x: { min: 0, max: VIEW_W },
        y: { min: 0, max: VIEW_H },
        lifespan: 5200,
        speedX: { min: -34, max: -8 },
        scale: { min: 2.5, max: 5 },
        alpha: { start: 0.07, end: 0 },
        tint: 0x9aa3b2,
        quantity: 1,
        frequency: lowFx ? 360 : 170,
      }, 4);
    }
  }

  private buildFog(accent: number, weather: Weather) {
    const lowFx = getSettings().lowFx;
    const count = lowFx ? 3 : weather === "smog" ? 8 : 6;
    const tint = weather === "smog" ? 0x8088a0 : weather === "embers" ? 0xff5a3c : accent;
    const maxAlpha = weather === "smog" ? 0.14 : 0.08;
    for (let i = 0; i < count; i++) {
      const baseAlpha = maxAlpha * (0.5 + Math.random() * 0.5);
      const img = this.scene.add
        .image(Math.random() * this.worldW, Math.random() * this.worldH, GLOW_KEY)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(tint)
        .setScale(6 + Math.random() * 5)
        .setAlpha(baseAlpha)
        .setDepth(3);
      this.fog.push({
        img,
        vx: (Math.random() - 0.5) * 10 + (weather === "smog" ? -8 : 0),
        vy: (Math.random() - 0.5) * 5,
        baseAlpha,
        seed: Math.random() * Math.PI * 2,
      });
    }
  }

  /** Drift fog + animate holograms. `heatNorm` (0..1) swells the fog as the city heats. */
  update(now: number, dtMs: number, heatNorm: number) {
    const dt = dtMs / 1000;
    for (const f of this.fog) {
      let x = f.img.x + f.vx * dt;
      let y = f.img.y + f.vy * dt;
      const m = 320;
      if (x < -m) x = this.worldW + m;
      if (x > this.worldW + m) x = -m;
      if (y < -m) y = this.worldH + m;
      if (y > this.worldH + m) y = -m;
      f.img.setPosition(x, y);
      f.img.setAlpha(f.baseAlpha * (0.7 + 0.3 * Math.sin(now * 0.0006 + f.seed)) * (1 + heatNorm * 0.6));
    }
    for (const h of this.holos) h.update(now, this.reduceFlashing);
  }
}

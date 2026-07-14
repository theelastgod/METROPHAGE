import Phaser from "phaser";
import { ASSETS } from "../assets/manifest";
import { generatePlaceholders } from "../assets/textures";
import { applyTextureFilters } from "../assets/textureFilters";
import { ensureItemIcons } from "../assets/itemIcons";
import { ensureNeonPipeline } from "../render/ensureNeon";
import { shouldPlayColdOpen } from "./ColdOpenScene";
import MusicDirector from "../audio/MusicDirector";
import Synth from "../audio/Synth";
import { COLORS } from "../config";
import { detectDeviceTier, hasSavedSettings, updateSettings } from "../systems/Settings";


/**
 * BootScene — loads manifest assets, bakes procedural fallbacks, registers pipelines.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    const barEl = document.getElementById("boot-bar");
    const tagEl = document.querySelector("#boot .tag");
    this.load.on("progress", (v: number) => {
      if (barEl) barEl.style.width = `${Math.round(v * 100)}%`;
      if (tagEl) tagEl.textContent = `LOADING ASSETS ${Math.round(v * 100)}%`;
    });

    for (const [category, list] of Object.entries(ASSETS)) {
      for (const a of list) {
        if (!a.file) continue;
        if (category === "audio") {
          this.load.audio(a.key, a.file);
        } else if (a.frameWidth && a.frameHeight) {
          this.load.spritesheet(a.key, a.file, {
            frameWidth: a.frameWidth,
            frameHeight: a.frameHeight,
          });
        } else {
          this.load.image(a.key, a.file);
        }
      }
    }
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bgVoid);
    if (!hasSavedSettings()) {
      const tier = detectDeviceTier();
      updateSettings({
        graphicsQuality: "auto",
        lowFx: tier === "low",
        uiScale: tier === "low" ? 1.1 : 1,
      });
    }
    generatePlaceholders(this);
    ensureItemIcons(this);
    applyTextureFilters(this);

    ensureNeonPipeline(this);

    this.registry.set("music", new MusicDirector(this.game));
    if (!this.registry.get("synth")) this.registry.set("synth", new Synth());

    const tagEl = document.querySelector("#boot .tag");
    if (tagEl) tagEl.textContent = "ENTERING NEON GRID";
    const barEl = document.getElementById("boot-bar");
    if (barEl) barEl.style.width = "100%";

    this.time.delayedCall(280, () => {
      const boot = document.getElementById("boot");
      if (boot) {
        boot.style.opacity = "0";
        window.setTimeout(() => boot.remove(), 700);
      }
      // Trailer plays on every reload (skippable). Automation can opt out via
      // ?skipIntro=1 or localStorage metrophage_skip_coldopen / coldopen_v2.
      this.scene.start(shouldPlayColdOpen() ? "ColdOpen" : "Select");
    });
  }
}
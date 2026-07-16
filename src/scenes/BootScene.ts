import Phaser from "phaser";
import { ASSETS, DEFERRED_WORLD_CATEGORIES } from "../assets/manifest";
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
    // Wishlist / optional HF packs may 404 mid-gen — don't stall boot. But NEVER fail
    // silently in prod: this handler used to warn only in DEV, so the entire art pack
    // could go missing on the live site with nothing in the console to say so.
    const failed: string[] = [];
    this.load.on("loaderror", (file: { key?: string }) => {
      if (file?.key) failed.push(file.key);
    });
    this.load.once("complete", () => {
      // Every dresser gates on `textures.exists`, so a missing pack degrades silently:
      // no hf_building_* → procedural façade under a dark roof cap (black buildings);
      // no hf_prop_* → propScatter drops its pool. Report the count so "the art didn't
      // load" is one glance at the console instead of a render-path bug hunt.
      const hf = this.textures.getTextureKeys().filter((k) => k.startsWith("hf_")).length;
      console.info(`[boot] ${hf} hf_* textures loaded, ${failed.length} failed`);
      if (failed.length) {
        console.warn(`[boot] assets failed — world art will fall back:`, failed.slice(0, 24));
      }
    });

    for (const [category, list] of Object.entries(ASSETS)) {
      if (DEFERRED_WORLD_CATEGORIES.has(category)) continue;
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

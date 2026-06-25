import Phaser from "phaser";
import { ASSETS } from "../assets/manifest";
import { generatePlaceholders } from "../assets/textures";
import { ensureItemIcons } from "../assets/itemIcons";
import NeonPipeline from "../render/NeonPipeline";
import MusicDirector from "../audio/MusicDirector";

/**
 * BootScene — loads any real asset files declared in the manifest, then fills in
 * procedural placeholders for everything still missing, and hands off to GameScene.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
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
    generatePlaceholders(this);
    ensureItemIcons(this); // bake procedural item icons (weapons / gear / consumables)

    // Register the neon post-FX pipeline once (WebGL only).
    if (this.renderer.type === Phaser.WEBGL) {
      (this.renderer as Phaser.Renderer.WebGL.WebGLRenderer).pipelines.addPostPipeline(
        "Neon",
        NeonPipeline,
      );
    }

    // Game-level music director — one shared bed that crossfades per environment
    // and survives scene changes. Created before the first scene so the title
    // screen has music. Falls back to the procedural Synth where no bed exists.
    this.registry.set("music", new MusicDirector(this.game));

    this.scene.start("Select");
  }
}

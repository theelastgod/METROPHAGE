import Phaser from "phaser";
import { allAssets } from "../assets/manifest";
import { generatePlaceholders } from "../assets/textures";
import NeonPipeline from "../render/NeonPipeline";

/**
 * BootScene — loads any real asset files declared in the manifest, then fills in
 * procedural placeholders for everything still missing, and hands off to GameScene.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload() {
    for (const a of allAssets()) {
      if (!a.file) continue;
      if (a.frameWidth && a.frameHeight) {
        this.load.spritesheet(a.key, a.file, {
          frameWidth: a.frameWidth,
          frameHeight: a.frameHeight,
        });
      } else {
        this.load.image(a.key, a.file);
      }
    }
  }

  create() {
    generatePlaceholders(this);

    // Register the neon post-FX pipeline once (WebGL only).
    if (this.renderer.type === Phaser.WEBGL) {
      (this.renderer as Phaser.Renderer.WebGL.WebGLRenderer).pipelines.addPostPipeline(
        "Neon",
        NeonPipeline,
      );
    }

    this.scene.start("Game");
  }
}

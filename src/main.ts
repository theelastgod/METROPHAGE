import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "./config";
import BootScene from "./scenes/BootScene";
import SelectScene from "./scenes/SelectScene";
import GameScene from "./scenes/GameScene";
import DiveScene from "./scenes/DiveScene";

// METROPHAGE — Phase 0 vertical slice entry point.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-root",
  backgroundColor: COLORS.bgVoid,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEW_W,
    height: VIEW_H,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, SelectScene, GameScene, DiveScene],
};

const game = new Phaser.Game(config);

// Dev-only handle for debugging/verification in the browser console.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

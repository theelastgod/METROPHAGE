import Phaser from "phaser";
import { VIEW_W, VIEW_H, COLORS } from "./config";
import BootScene from "./scenes/BootScene";
import SelectScene from "./scenes/SelectScene";
import CustomizeScene from "./scenes/CustomizeScene";
import Prologue from "./scenes/Prologue";
import GameScene from "./scenes/GameScene";
import DiveScene from "./scenes/DiveScene";
import OnlineScene from "./scenes/OnlineScene";
import CityScene from "./scenes/CityScene";
import { getMetroStatus } from "./economy/metro";
import { mountMetroPanel } from "./ui/MetroPanel";
import { getOnlinePlayer } from "./economy/session";

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
  scene: [BootScene, SelectScene, CustomizeScene, Prologue, GameScene, DiveScene, OnlineScene, CityScene],
};

const game = new Phaser.Game(config);

// $METRO bridge panel — dormant unless the on-chain layer is enabled (a valid CA).
mountMetroPanel(getOnlinePlayer);

// Dev-only handle for debugging/verification in the browser console.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
  // Surface the $METRO gate state so it's obvious whether the on-chain layer is live.
  const m = getMetroStatus();
  console.info(
    `[$METRO] ${m.enabled ? `ENABLED · ${m.cluster}${m.mainnetLive ? " · MAINNET LIVE" : ""}` : "disabled (off-chain only)"}`,
  );
}

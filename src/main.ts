import Phaser from "phaser";
// MUST be the first project import: fixes the backing resolution (render tier) at
// module-evaluation time, before any scene/UI module captures uiDim()-derived sizes.
import "./render/renderTier";
import { VIEW_W, VIEW_H, COLORS } from "./config";
import BootScene from "./scenes/BootScene";
import SelectScene from "./scenes/SelectScene";
import CustomizeScene from "./scenes/CustomizeScene";
import Prologue from "./scenes/Prologue";
import OnlineScene from "./scenes/OnlineScene";


import { getMetroStatus } from "./economy/metro";
import { mountMetroPanel } from "./ui/MetroPanel";
import { getOnlinePlayer } from "./economy/session";
import { randomCustomization } from "./game/customization";

// METROPHAGE — Path A: one server-authoritative world; personal campaign per player.
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: "game-root",
  backgroundColor: COLORS.bgVoid,
  pixelArt: true,
  roundPixels: true,
  render: {
    antialias: false,
    powerPreference: "high-performance",
  },
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
  input: {
    gamepad: true,
    activePointers: 3, // touch devices: tap-to-move + UI taps can overlap
  },
  scene: [BootScene, SelectScene, CustomizeScene, Prologue, OnlineScene],
};

const game = new Phaser.Game(config);

// $METRO bridge panel — dormant unless the on-chain layer is enabled (a valid CA).
mountMetroPanel(getOnlinePlayer);

// Dev-only handle for debugging/verification in the browser console.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game; __enterCity: () => void }).__game = game;
  const w = window as unknown as {
    __game: Phaser.Game;
    __enterCity: () => void;
    __playtest: { offline: () => void; drill: () => void };
  };
  w.__enterCity = () => {
    if (!game.registry.get("classId")) game.registry.set("classId", "metrophage");
    if (!game.registry.get("customization")) game.registry.set("customization", randomCustomization("metrophage"));
    game.scene.start("Online", { zone: "safe" });
  };
  w.__playtest = {
    offline: () => {
      game.registry.set("offlinePlay", true);
      game.registry.remove("characterLocked");
      game.registry.remove("walletAddress");
      game.scene.start("Select");
    },
    drill: () => game.scene.start("Online", { zone: "tutorial", tutorialMode: "quick" }),
  };
  // Surface the $METRO gate state so it's obvious whether the on-chain layer is live.
  const m = getMetroStatus();
  console.info(
    `[$METRO] ${m.enabled ? `ENABLED · ${m.cluster}${m.mainnetLive ? " · MAINNET LIVE" : ""}` : "disabled (off-chain only)"}`,
  );
}

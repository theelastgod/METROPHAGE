import Phaser from "phaser";
import {
  GLOW_KEY,
  SPARK_KEY,
  BULLET_KEY,
  NODE_KEY,
  NODE_INFECTED_KEY,
  PORTRAIT_PLAYER_KEY,
  PORTRAIT_NPC_KEY,
  UI_FRAME_KEY,
  UI_GUN_KEY,
  UI_PANEL_KEY,
  UI_BTN_RING_KEY,
  IDENTITY_PANEL_KEY,
  IDENTITY_BTN_PRIMARY_KEY,
  IDENTITY_BTN_SECONDARY_KEY,
  IDENTITY_MARK_KEY,
  ABILITY_ICON_KEYS,
  MENU_BG_KEY,
} from "./manifest";

/** Soft radial / gradient textures — LINEAR avoids blocky banding when scaled. */
const LINEAR_KEYS = new Set([
  GLOW_KEY,
  SPARK_KEY,
  BULLET_KEY,
  NODE_KEY,
  NODE_INFECTED_KEY,
  PORTRAIT_PLAYER_KEY,
  PORTRAIT_NPC_KEY,
  UI_FRAME_KEY,
  UI_GUN_KEY,
  UI_PANEL_KEY,
  UI_BTN_RING_KEY,
  IDENTITY_PANEL_KEY,
  IDENTITY_BTN_PRIMARY_KEY,
  IDENTITY_BTN_SECONDARY_KEY,
  IDENTITY_MARK_KEY,
  MENU_BG_KEY,
  ...ABILITY_ICON_KEYS,
]);

/**
 * Apply consistent sampling filters after manifest load + procedural bake.
 * Pixel sheets and the photo tileset stay NEAREST (crisp at downscale); glows,
 * painted presentation art, and gradient FX stay LINEAR.
 */
export function applyTextureFilters(scene: Phaser.Scene): void {
  for (const key of scene.textures.getTextureKeys()) {
    if (key.startsWith("__") || !scene.textures.exists(key)) continue;
    // Painted presentation art (class cards, portrait sheets, menu key art, HF props)
    // is photographic — LINEAR avoids blocky scaling on title menus and dialogue.
    const painted =
      LINEAR_KEYS.has(key) ||
      key.startsWith("classart_") ||
      key.startsWith("portraits_") ||
      key.startsWith("portrait_") ||
      key.startsWith("ability_") ||
      key.startsWith("loot_") ||
      key.startsWith("crest_") ||
      key.startsWith("hf_prop_") ||
      key.startsWith("hf_building_") ||
      key.startsWith("gun_hf_") ||
      key.startsWith("identity_");
    const mode = painted ? Phaser.Textures.FilterMode.LINEAR : Phaser.Textures.FilterMode.NEAREST;
    scene.textures.get(key).setFilter(mode);
  }
}

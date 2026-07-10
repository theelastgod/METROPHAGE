import Phaser from "phaser";
import { NPC } from "../config";
import { GLOW_KEY } from "../assets/manifest";
import { bakeRemoteLook, lookKey } from "../game/customization";
import type { PlayerLook } from "../net/protocol";

/** A city inhabitant: a customized character (varied skin/hair/build via the same look
 *  bake as players) with a name label + an "E TALK" prompt when the player is near.
 *  The scene opens dialogue / quest interactions on the E press. */
export interface NpcDef {
  id: string;
  name: string;
  look: PlayerLook;
  lines: string[]; // flavour dialogue; quest logic is layered on by the quest system
  quest?: string; // quest id this NPC gives
}

export default class CityNpc {
  readonly id: string;
  readonly name: string;
  readonly def: NpcDef;
  readonly x: number;
  readonly y: number;
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private prompt: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, def: NpcDef) {
    this.id = def.id;
    this.name = def.name;
    this.def = def;
    this.x = x;
    this.y = y;

    const key = lookKey(def.look);
    bakeRemoteLook(scene, key, def.look); // cached by look — identical NPCs share a texture
    this.shadow = scene.add.image(x, y + 8, GLOW_KEY).setTint(0x05070d).setDepth(7).setScale(0.46, 0.28).setAlpha(0.4); // contact shadow
    this.sprite = scene.add.image(x, y, key, 0).setTint(0xffffff).setDepth(8).setOrigin(0.5, 0.62);
    this.sprite.setScale(1.12);
    // Name is proximity-only — permanent floating labels clutter the city.
    this.label = scene.add
      .text(x, y - 22, def.name, { fontFamily: "Courier New, monospace", fontSize: "9px", color: "#bfe6ff" })
      .setOrigin(0.5)
      .setDepth(9)
      .setVisible(false);
    this.label.setShadow(0, 0, "#0a0e1a", 3, true, true);
    this.prompt = scene.add
      .text(x, y - 34, "E  TALK", { fontFamily: "Courier New, monospace", fontSize: "10px", color: "#9dff3c" })
      .setOrigin(0.5)
      .setDepth(9)
      .setVisible(false);
    this.prompt.setShadow(0, 0, "#9dff3c", 6, true, true);

    scene.tweens.add({
      targets: this.sprite,
      scaleY: 1.12 * 1.05,
      scaleX: 1.12 * 0.98,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
  }

  /** Toggle the prompt by player distance; returns whether the player is in range. */
  update(playerDist: number): boolean {
    const near = playerDist <= NPC.interactRange;
    this.prompt.setVisible(near);
    this.label.setVisible(near);
    return near;
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.label.destroy();
    this.prompt.destroy();
  }
}

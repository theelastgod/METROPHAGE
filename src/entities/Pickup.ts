import Phaser from "phaser";
import { GLOW_KEY } from "../assets/manifest";
import { Item, RARITIES } from "../game/items";

/**
 * A dropped loot item in the world — a rarity-tinted glow the player walks over to
 * collect. The scene wires overlap(player, pickups) -> collect.
 */
export default class Pickup extends Phaser.Physics.Arcade.Image {
  readonly item: Item;

  constructor(scene: Phaser.Scene, x: number, y: number, item: Item) {
    super(scene, x, y, GLOW_KEY);
    this.item = item;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const color = RARITIES[item.rarity].color;
    this.setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.5)
      .setDepth(7);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(20, -4, -4).setAllowGravity(false);

    scene.tweens.add({
      targets: this,
      scale: 0.62,
      yoyo: true,
      repeat: -1,
      duration: 600,
      ease: "Sine.inOut",
    });
    // Despawn if left uncollected.
    scene.time.delayedCall(25000, () => this.active && this.destroy());
  }
}

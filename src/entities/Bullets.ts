import Phaser from "phaser";
import { BULLET } from "../config";
import { BULLET_KEY } from "../assets/manifest";

/**
 * Pooled projectile manager. Keeps physics/render concerns local; the scene just
 * calls fire() and update(). Bullets die on lifetime expiry or wall impact.
 */
export default class Bullets {
  readonly group: Phaser.Physics.Arcade.Group;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.group = scene.physics.add.group({
      defaultKey: BULLET_KEY,
      maxSize: BULLET.maxActive,
    });
  }

  fire(x: number, y: number, angle: number) {
    const b = this.group.get(x, y) as Phaser.Physics.Arcade.Image | null;
    if (!b) return; // pool exhausted

    b.setActive(true).setVisible(true).setDepth(9).setRotation(angle);
    const body = b.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.reset(x, y);
    body.setCircle(BULLET.radius, b.width / 2 - BULLET.radius, b.height / 2 - BULLET.radius);
    body.setAllowGravity(false);
    this.scene.physics.velocityFromRotation(angle, BULLET.speed, body.velocity);
    b.setData("dieAt", this.scene.time.now + BULLET.lifetimeMs);
  }

  kill(obj: Phaser.GameObjects.GameObject) {
    const b = obj as Phaser.Physics.Arcade.Image;
    b.setActive(false).setVisible(false);
    const body = b.body as Phaser.Physics.Arcade.Body;
    body.stop();
    body.enable = false;
  }

  /** Count of live bullets (used for tests/debug). */
  get activeCount(): number {
    return this.group.countActive(true);
  }

  update(now: number) {
    this.group.getChildren().forEach((go) => {
      const b = go as Phaser.Physics.Arcade.Image;
      if (b.active && now >= (b.getData("dieAt") as number)) this.kill(b);
    });
  }
}

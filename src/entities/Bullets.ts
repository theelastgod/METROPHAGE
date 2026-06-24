import Phaser from "phaser";
import { BULLET } from "../config";
import { BULLET_KEY } from "../assets/manifest";

export interface BulletOpts {
  textureKey: string;
  speed: number;
  lifetimeMs: number;
  radius: number;
  maxActive: number;
  damage: number; // applied on hit (read back via getData("dmg"))
  tint?: number; // optional recolor (e.g. hostile fire)
}

const DEFAULTS: BulletOpts = {
  textureKey: BULLET_KEY,
  speed: BULLET.speed,
  lifetimeMs: BULLET.lifetimeMs,
  radius: BULLET.radius,
  maxActive: BULLET.maxActive,
  damage: BULLET.damage,
};

/**
 * Pooled projectile manager. One instance per "faction" (player / cops). Keeps
 * physics/render concerns local; the scene calls fire() and update(). Bullets die
 * on lifetime expiry or wall impact (the scene wires the wall collider).
 */
export default class Bullets {
  readonly group: Phaser.Physics.Arcade.Group;
  private scene: Phaser.Scene;
  private opts: BulletOpts;

  constructor(scene: Phaser.Scene, opts: Partial<BulletOpts> = {}) {
    this.scene = scene;
    this.opts = { ...DEFAULTS, ...opts };
    this.group = scene.physics.add.group({
      defaultKey: this.opts.textureKey,
      maxSize: this.opts.maxActive,
    });
  }

  /** Update the pool's shot params in place (e.g. on a weapon swap) — keeps the group +
   *  its wall/enemy colliders intact. */
  configure(opts: Partial<BulletOpts>) {
    this.opts = { ...this.opts, ...opts };
  }

  fire(x: number, y: number, angle: number, damageOverride?: number) {
    const b = this.group.get(x, y) as Phaser.Physics.Arcade.Image | null;
    if (!b) return; // pool exhausted

    b.setActive(true).setVisible(true).setDepth(9).setRotation(angle);
    if (this.opts.tint !== undefined) b.setTint(this.opts.tint);

    const body = b.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.reset(x, y);
    const r = this.opts.radius;
    body.setCircle(r, b.width / 2 - r, b.height / 2 - r);
    body.setAllowGravity(false);
    this.scene.physics.velocityFromRotation(angle, this.opts.speed, body.velocity);
    b.setData("dieAt", this.scene.time.now + this.opts.lifetimeMs);
    b.setData("dmg", damageOverride ?? this.opts.damage);
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

import Phaser from "phaser";

export type CombatPose = "idle" | "attack" | "hit" | "dead";

const POSE_TWEEN_MS: Record<Exclude<CombatPose, "idle">, number> = {
  attack: 120,
  hit: 160,
  dead: 400,
};

/**
 * Brief combat poses on any character sprite — scale/tint/recoil without new art frames.
 * Works with both procedural and authored 32×32 sheets.
 */
export function playCombatPose(sprite: Phaser.GameObjects.Sprite, pose: CombatPose, tint?: number) {
  if (pose === "idle") return;
  const scene = sprite.scene;
  scene.tweens.killTweensOf(sprite);
  const baseScaleX = sprite.scaleX;
  const baseScaleY = sprite.scaleY;
  const baseTint = sprite.tintTopLeft;

  if (pose === "attack") {
    scene.tweens.add({
      targets: sprite,
      scaleX: baseScaleX * 1.12,
      scaleY: baseScaleY * 0.92,
      duration: POSE_TWEEN_MS.attack * 0.45,
      yoyo: true,
      ease: "Quad.out",
    });
    if (tint !== undefined) {
      sprite.setTint(tint);
      scene.time.delayedCall(POSE_TWEEN_MS.attack, () => sprite.setTint(baseTint));
    }
    return;
  }

  if (pose === "hit") {
    sprite.setTint(0xffffff);
    scene.tweens.add({
      targets: sprite,
      x: sprite.x + (Math.random() < 0.5 ? -4 : 4),
      duration: POSE_TWEEN_MS.hit * 0.35,
      yoyo: true,
      ease: "Sine.out",
      onComplete: () => sprite.setTint(baseTint),
    });
    return;
  }

  if (pose === "dead") {
    sprite.setTint(0x888899);
    scene.tweens.add({
      targets: sprite,
      alpha: 0.25,
      scaleX: baseScaleX * 0.85,
      scaleY: baseScaleY * 0.6,
      angle: sprite.angle + (Math.random() < 0.5 ? -90 : 90),
      duration: POSE_TWEEN_MS.dead,
      ease: "Quad.in",
    });
  }
}

/** Flash all enemy sprites matching an id when they take damage. */
export function flashEnemySprite(
  sprites: Map<number, Phaser.GameObjects.Sprite>,
  id: number,
  boss?: boolean,
) {
  const s = sprites.get(id);
  if (!s) return;
  playCombatPose(s, boss ? "hit" : "hit");
}
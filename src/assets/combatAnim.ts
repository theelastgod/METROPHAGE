import Phaser from "phaser";

export type CombatPose = "idle" | "attack" | "hit" | "dead";

const POSE_TWEEN_MS: Record<Exclude<CombatPose, "idle">, number> = {
  attack: 120,
  hit: 160,
  dead: 400,
};

const BASE_SX = "__baseSX";
const BASE_SY = "__baseSY";

function baseScale(sprite: Phaser.GameObjects.Sprite): { sx: number; sy: number } {
  // Pin the "rest" scale so stacked attack poses don't compound (body grows forever).
  if (sprite.getData(BASE_SX) == null) {
    sprite.setData(BASE_SX, sprite.scaleX || 1);
    sprite.setData(BASE_SY, sprite.scaleY || 1);
  }
  return { sx: sprite.getData(BASE_SX) as number, sy: sprite.getData(BASE_SY) as number };
}

/**
 * Brief combat poses on any character sprite — scale/tint/recoil without new art frames.
 * Works with both procedural and authored 32×32 sheets.
 */
export function playCombatPose(sprite: Phaser.GameObjects.Sprite, pose: CombatPose, tint?: number) {
  if (pose === "idle") return;
  if (!sprite?.active) return;
  const scene = sprite.scene;
  scene.tweens.killTweensOf(sprite);
  const { sx: baseScaleX, sy: baseScaleY } = baseScale(sprite);
  // Always snap back to rest scale before a new pose so yoyo ends clean.
  sprite.setScale(baseScaleX, baseScaleY);
  const baseTint = 0xffffff;

  if (pose === "attack") {
    scene.tweens.add({
      targets: sprite,
      scaleX: baseScaleX * 1.12,
      scaleY: baseScaleY * 0.92,
      duration: POSE_TWEEN_MS.attack * 0.45,
      yoyo: true,
      ease: "Quad.out",
      onComplete: () => {
        if (sprite.active) sprite.setScale(baseScaleX, baseScaleY);
      },
    });
    if (tint !== undefined) {
      sprite.setTint(tint);
      scene.time.delayedCall(POSE_TWEEN_MS.attack, () => {
        if (sprite.active) sprite.setTint(baseTint);
      });
    }
    return;
  }

  if (pose === "hit") {
    // Flash only — never tween sprite.x (position is overwritten every frame from net pred).
    sprite.setTint(0xffffff);
    scene.tweens.add({
      targets: sprite,
      alpha: 0.55,
      duration: POSE_TWEEN_MS.hit * 0.4,
      yoyo: true,
      ease: "Sine.out",
      onComplete: () => {
        if (!sprite.active) return;
        sprite.setTint(baseTint);
        // Don't leave hit-flash alpha stuck if a death tween was about to start.
        if (sprite.alpha < 0.95) sprite.setAlpha(1);
      },
    });
    return;
  }

  if (pose === "dead") {
    // Visual only while the body is down. Callers MUST restore on respawn
    // (OnlineScene.restoreLocalBody) or the runner stays a ghost forever.
    sprite.setTint(0x888899);
    scene.tweens.add({
      targets: sprite,
      alpha: 0.35,
      scaleX: baseScaleX * 0.9,
      scaleY: baseScaleY * 0.7,
      angle: (Math.random() < 0.5 ? -55 : 55),
      duration: POSE_TWEEN_MS.dead,
      ease: "Quad.in",
    });
  }
}

/** Hard reset after a combat pose (respawn / zone travel / defensive). */
export function resetCombatPose(sprite: Phaser.GameObjects.Sprite, scale?: number) {
  if (!sprite?.scene) return;
  sprite.scene.tweens.killTweensOf(sprite);
  const sx = scale ?? (sprite.getData(BASE_SX) as number) ?? 1;
  const sy = scale ?? (sprite.getData(BASE_SY) as number) ?? 1;
  sprite.setData(BASE_SX, sx);
  sprite.setData(BASE_SY, sy);
  sprite.setAlpha(1).setAngle(0).setScale(sx, sy).setTint(0xffffff);
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

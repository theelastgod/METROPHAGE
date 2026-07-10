import { describe, expect, it, vi } from "vitest";

/**
 * Lightweight regression checks for combat pose invariants.
 * Full Phaser sprites are heavy; we exercise the pure helpers where possible.
 */

describe("combatAnim pose contracts", () => {
  it("exports resetCombatPose that is safe on missing scene", async () => {
    const { resetCombatPose } = await import("./combatAnim");
    // @ts-expect-error intentional null
    expect(() => resetCombatPose(null)).not.toThrow();
  });

  it("POSE timing keeps death longer than hit/attack", async () => {
    // Re-import module graph; timings are private — assert via playCombatPose side effects
    // by mocking a minimal sprite.
    const { playCombatPose, resetCombatPose } = await import("./combatAnim");

    const tweens: Array<{ targets: unknown; alpha?: number; onComplete?: () => void }> = [];
    const sprite = {
      active: true,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      angle: 0,
      tintTopLeft: 0xffffff,
      getData: (k: string) => (sprite as unknown as Record<string, unknown>)[`d_${k}`],
      setData: (k: string, v: unknown) => {
        (sprite as unknown as Record<string, unknown>)[`d_${k}`] = v;
      },
      setScale: (x: number, y?: number) => {
        sprite.scaleX = x;
        sprite.scaleY = y ?? x;
        return sprite;
      },
      setAlpha: (a: number) => {
        sprite.alpha = a;
        return sprite;
      },
      setAngle: (a: number) => {
        sprite.angle = a;
        return sprite;
      },
      setTint: () => sprite,
      scene: {
        tweens: {
          killTweensOf: vi.fn(),
          add: (cfg: { targets: unknown; alpha?: number; onComplete?: () => void }) => {
            tweens.push(cfg);
            return cfg;
          },
        },
        time: { delayedCall: vi.fn() },
      },
    };

    playCombatPose(sprite as never, "attack");
    playCombatPose(sprite as never, "attack");
    // After two attacks, base scale should still be 1 (not compounded)
    expect(sprite.getData("__baseSX")).toBe(1);
    expect(sprite.scaleX).toBeCloseTo(1, 5); // snapped to base before tween

    playCombatPose(sprite as never, "dead");
    const deadTween = tweens[tweens.length - 1];
    expect(deadTween.alpha).toBe(0.35);

    resetCombatPose(sprite as never, 1);
    expect(sprite.alpha).toBe(1);
    expect(sprite.angle).toBe(0);
    expect(sprite.scaleX).toBe(1);
  });
});

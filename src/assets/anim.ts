import Phaser from "phaser";
import { CHAR, WALK_STEPS, drawCharacter, drawAgent, type CharSpec } from "./charart";
import { bakeDrawnFrames } from "./pixelart";
import { faceFrame, COP_KEY, NPC_KEY } from "./manifest";

/** Authored sheets with one frame per facing (no walk cycle). */
const SIMPLE_SHEETS = new Set([COP_KEY, NPC_KEY]);

// METROPHAGE — character animation. The procedural sheets bake 4 facings × WALK_STEPS
// frames (facing-major: index = facing*WALK_STEPS + step). This module owns the bake
// helpers + the per-facing walk anims + a single driver that every entity uses instead
// of the old static setFrame(faceFrame(...)). Anims are created lazily and keyed by the
// texture, so a live re-bake (the player customizer) or a swapped remote look just works.

/** Total frames in a directional character sheet. */
export const CHAR_FRAMES = 4 * WALK_STEPS;

const DIRS = ["down", "left", "right", "up"] as const;
/** Stride cadence. ~9fps × 4 frames ≈ a step every 0.44s — reads at run speed. */
const WALK_FPS = 9;

/** Ambient-crowd sheet: a single facing, a short shuffle loop. */
const AGENT_STEPS = WALK_STEPS;
const AGENT_FPS = 6;

/** Bake a full directional walk sheet (4 facings × WALK_STEPS) for a CharSpec. */
export function bakeWalkSheet(scene: Phaser.Scene, key: string, spec: CharSpec) {
  bakeDrawnFrames(scene, key, CHAR_FRAMES, CHAR, CHAR, (ctx, f) =>
    drawCharacter(ctx, Math.floor(f / WALK_STEPS), spec, f % WALK_STEPS),
  );
}

/** Bake an ambient-crowd shuffle sheet (single facing, AGENT_STEPS frames). */
export function bakeAgentSheet(scene: Phaser.Scene, key: string, w: number, h: number) {
  bakeDrawnFrames(scene, key, AGENT_STEPS, w, h, (ctx, f) => drawAgent(ctx, f));
}

/** (Re)create the four directional walk anims for a baked character texture `key`. */
function ensureCharAnims(scene: Phaser.Scene, key: string) {
  for (let d = 0; d < 4; d++) {
    const name = `${key}__walk_${DIRS[d]}`;
    if (scene.anims.exists(name)) continue;
    const start = d * WALK_STEPS;
    scene.anims.create({
      key: name,
      frames: Array.from({ length: WALK_STEPS }, (_, s) => ({ key, frame: start + s })),
      frameRate: WALK_FPS,
      repeat: -1,
    });
  }
}

/**
 * Face + animate a character sprite from a direction vector. Plays the walk cycle for
 * the facing while `moving`, otherwise holds that facing's neutral stance. This is the
 * one place facing→frame is resolved; it replaces every setFrame(faceFrame(...)).
 */
export function driveChar(
  sprite: Phaser.GameObjects.Sprite,
  vx: number,
  vy: number,
  moving: boolean,
) {
  const key = sprite.texture.key;
  const dir = faceFrame(vx, vy); // 0=down 1=left 2=right 3=up
  if (SIMPLE_SHEETS.has(key)) {
    sprite.anims.stop();
    sprite.setFrame(dir);
    return;
  }
  if (moving) {
    ensureCharAnims(sprite.scene, key);
    sprite.anims.play(`${key}__walk_${DIRS[dir]}`, true);
  } else {
    sprite.anims.stop();
    sprite.setFrame(dir * WALK_STEPS); // neutral stance for this facing
  }
}

/** Drive an ambient-crowd sprite: shuffle while wandering, else hold still. */
export function driveAgent(sprite: Phaser.GameObjects.Sprite, moving: boolean) {
  const key = sprite.texture.key;
  const name = `${key}__shuffle`;
  if (moving) {
    if (!sprite.scene.anims.exists(name)) {
      sprite.scene.anims.create({
        key: name,
        frames: Array.from({ length: AGENT_STEPS }, (_, s) => ({ key, frame: s })),
        frameRate: AGENT_FPS,
        repeat: -1,
      });
    }
    sprite.anims.play(name, true);
  } else {
    sprite.anims.stop();
    sprite.setFrame(0);
  }
}

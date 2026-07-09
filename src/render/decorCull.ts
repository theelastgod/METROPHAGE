// METROPHAGE — static-decor visibility culling.
//
// Zone builders scatter thousands of one-off Images/Graphics (puddle glows, prop
// shadows, facades, salvage) across maps far bigger than the screen. Phaser renders
// every display-list child each frame, so a 450×360-tile hub pays for ~3.5k objects
// while ~150 are visible — measured 4 FPS on an integrated-GPU Mac. This sweeps the
// static ground band into per-cell containers after the zone builds, then toggles
// whole cells' visibility against the camera. Dynamic objects (tweens, input,
// origin-anchored aggregate painters, HUD) are deliberately left alone.

import Phaser from "phaser";

const CELL = 1600; // world px per visibility cell (~2 screens at design zoom)

export function installDecorCulling(
  scene: Phaser.Scene,
  opts: { minDepth?: number; maxDepth?: number; exclude?: Set<Phaser.GameObjects.GameObject> } = {},
): { adopted: number; cells: number } {
  const minD = opts.minDepth ?? 0.5;
  const maxD = opts.maxDepth ?? 6.5;
  const exclude = opts.exclude ?? new Set<Phaser.GameObjects.GameObject>();

  type Positioned = Phaser.GameObjects.Image; // shape shared by Image/Rectangle/Graphics for x/y/depth
  const adoptees: Array<{ obj: Phaser.GameObjects.GameObject; cx: number; cy: number; depth: number }> = [];

  for (const obj of [...scene.children.list]) {
    if (exclude.has(obj)) continue;
    const t = obj.type;
    // Graphics are excluded: Phaser tracks no bounds for them, and painters park them
    // at the origin drawing at absolute coords — there is nothing safe to cull by.
    if (t !== "Image" && t !== "Rectangle") continue;
    const o = obj as Positioned;
    if (o.depth < minD || o.depth > maxD) continue;
    if (o.scrollFactorX !== 1 || o.scrollFactorY !== 1) continue; // HUD/parallax stays live
    if (o.input) continue; // interactive stays live
    if (scene.tweens.getTweensOf(obj).length > 0) continue; // animated (pulse glows) stays live
    if (o.x === 0 && o.y === 0) continue; // origin-anchored = likely aggregate/dynamic

    adoptees.push({ obj, cx: Math.floor(o.x / CELL), cy: Math.floor(o.y / CELL), depth: o.depth });
  }

  // stable ground-band paint order inside each cell
  adoptees.sort((a, b) => a.depth - b.depth);

  const cells = new Map<string, Phaser.GameObjects.Container>();
  for (const a of adoptees) {
    const key = `${a.cx},${a.cy}`;
    let c = cells.get(key);
    if (!c) {
      c = scene.add.container(0, 0).setDepth(3); // ground band — under entities (7+)
      cells.set(key, c);
    }
    c.add(a.obj); // container sits at (0,0): children keep absolute world coords
  }

  const update = () => {
    const view = scene.cameras.main.worldView;
    const x0 = Math.floor((view.x - CELL) / CELL);
    const x1 = Math.floor((view.right + CELL) / CELL);
    const y0 = Math.floor((view.y - CELL) / CELL);
    const y1 = Math.floor((view.bottom + CELL) / CELL);
    for (const [key, c] of cells) {
      const comma = key.indexOf(",");
      const cx = +key.slice(0, comma);
      const cy = +key.slice(comma + 1);
      c.setVisible(cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1);
    }
  };
  update();
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, update));
  return { adopted: adoptees.length, cells: cells.size };
}

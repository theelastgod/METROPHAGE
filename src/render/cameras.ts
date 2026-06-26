import Phaser from "phaser";
import { RENDER_SCALE } from "../config";

/**
 * Supersampled rendering with an isolated UI layer.
 *
 * The game canvas is the big backing buffer (VIEW_W×VIEW_H = 2560×1440) but the world is
 * authored in the 960×540 logical space, so the world camera is zoomed by RENDER_SCALE:
 * the original framing fills the bigger buffer → crisp, not nearest-neighbour upscaled.
 *
 * A second, zoom-1 UI camera renders ONLY the screen-space HUD/panels (scrollFactor 0),
 * isolating them from the world camera's zoom/scroll AND its neon post-FX. That both
 * keeps the UI correctly placed (a zoomed main camera would displace scroll-fixed UI)
 * and sharpens its text. World vs UI objects are partitioned automatically by
 * scrollFactor and refreshed whenever the display list changes (e.g. a panel opens), so
 * individual call sites need no per-object bookkeeping. Phaser's input honours camera
 * ignore (`GameObject.willRender`), so clicks on UI hit-test through the UI camera.
 *
 * @param designZoom the scene's original (pre-supersample) world zoom — 1 for most
 *        scenes, 1.35 for the zoomed-in city interiors.
 */
export function installUiCamera(scene: Phaser.Scene, designZoom = 1): Phaser.Cameras.Scene2D.Camera {
  const main = scene.cameras.main;
  main.setZoom(designZoom * RENDER_SCALE);

  const ui = scene.cameras.add(0, 0, scene.scale.width, scene.scale.height);
  ui.setName("ui");
  ui.setOrigin(0, 0);
  ui.setScroll(0, 0);
  ui.transparent = true; // draw over the world, never clear it

  let lastCount = -1;
  const partition = () => {
    const uiObjs: Phaser.GameObjects.GameObject[] = [];
    const worldObjs: Phaser.GameObjects.GameObject[] = [];
    for (const go of scene.children.list) {
      const sf = (go as unknown as { scrollFactorX?: number }).scrollFactorX;
      if (sf === 0) uiObjs.push(go);
      else worldObjs.push(go);
    }
    main.ignore(uiObjs); // world camera skips the HUD…
    ui.ignore(worldObjs); // …and the UI camera skips the world (ignore is idempotent)
  };
  const onUpdate = () => {
    const n = scene.children.list.length;
    if (n !== lastCount) {
      lastCount = n;
      partition();
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate),
  );
  partition(); // initial pass for everything created before this call
  return ui;
}

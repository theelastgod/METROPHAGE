import Phaser from "phaser";

/**
 * Menu scenes render at full backing resolution (no world zoom). Splits backdrop
 * (scrollFactor 1, neon post-FX) from UI chrome (scrollFactor 0, sharp).
 */
export function installMenuCameras(scene: Phaser.Scene): Phaser.Cameras.Scene2D.Camera {
  const main = scene.cameras.main;
  const ui = scene.cameras.add(0, 0, scene.scale.width, scene.scale.height);
  ui.setName("ui");
  ui.setOrigin(0, 0);
  ui.setScroll(0, 0);
  ui.transparent = true;

  let lastCount = -1;
  const partition = () => {
    const uiObjs: Phaser.GameObjects.GameObject[] = [];
    const worldObjs: Phaser.GameObjects.GameObject[] = [];
    for (const go of scene.children.list) {
      const sfx = (go as unknown as { scrollFactorX?: number }).scrollFactorX ?? 1;
      if (sfx === 0) uiObjs.push(go);
      else worldObjs.push(go);
    }
    main.ignore(uiObjs);
    ui.ignore(worldObjs);
  };
  const onUpdate = () => {
    const n = scene.children.list.length;
    if (n !== lastCount) {
      lastCount = n;
      partition();
    }
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate));
  partition();
  return ui;
}

/** Pin HUD/menu chrome to the sharp UI camera. */
export function asMenuUi<T extends Phaser.GameObjects.GameObject>(go: T): T {
  const o = go as Phaser.GameObjects.GameObject & { setScrollFactor?: (x: number, y?: number) => void };
  o.setScrollFactor?.(0);
  return go;
}

/** Pin every object above backdrop depth to the UI camera. */
export function pinMenuUiLayer(scene: Phaser.Scene, backdropMaxDepth = 2): void {
  for (const go of scene.children.list) {
    const depth = (go as { depth?: number }).depth ?? 0;
    if (depth <= backdropMaxDepth) continue;
    asMenuUi(go);
  }
}
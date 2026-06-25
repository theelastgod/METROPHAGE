import Phaser from "phaser";

// METROPHAGE — code-authored pixel art. Sprites are written as pixel maps (rows of
// chars, one char per pixel) over a small palette, baked to crisp (no-AA) textures
// at integer scale at boot. Multi-tone palettes give proper pixel-art shading; the
// neon post-FX then adds the bloom. Grayscale maps are meant to be tinted per class.

export type Palette = Record<string, number | undefined>; // char -> 0xRRGGBB (undef = transparent)

const css = (c: number) => "#" + (c & 0xffffff).toString(16).padStart(6, "0");

/** Draw one pixel map into a 2D context at (ox,oy), `scale` device-px per cell. */
export function paintMap(
  ctx: CanvasRenderingContext2D,
  map: string[],
  palette: Palette,
  ox: number,
  oy: number,
  scale: number,
) {
  for (let y = 0; y < map.length; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const col = palette[row[x]];
      if (col === undefined) continue;
      ctx.fillStyle = css(col);
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
}

function newCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function register(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement) {
  const existing = scene.textures.exists(key) ? scene.textures.get(key) : null;
  // Re-baking a key (e.g. the custom player, rebaked on every scene that uses it and on
  // server look-sync) used to remove + re-add the texture. That destroys its Frame objects,
  // and any animation still referencing them (a global walk anim, created lazily on first
  // move) then plays a null frame → hard crash. Instead, when an existing CANVAS texture is
  // the same size, redraw into it in place and refresh: the Frame objects (and the anims
  // bound to them) stay valid, and we never remove a texture a live sprite is mid-play on.
  const ctx = existing && (existing as unknown as { context?: CanvasRenderingContext2D }).context;
  if (existing && ctx && typeof (existing as unknown as { refresh?: () => void }).refresh === "function") {
    const src = existing.getSourceImage() as HTMLCanvasElement;
    if (src && src.width === canvas.width && src.height === canvas.height) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(canvas, 0, 0);
      (existing as unknown as { refresh: () => void }).refresh();
      return existing;
    }
  }
  if (existing) scene.textures.remove(key);
  return scene.textures.addCanvas(key, canvas);
}

/** Bake N equal-size pixel-map frames into one horizontal spritesheet texture. */
export function bakeFrames(
  scene: Phaser.Scene,
  key: string,
  frames: string[][],
  palette: Palette,
  scale = 2,
) {
  const cols = Math.max(...frames.flat().map((r) => r.length));
  frames = frames.map((f) => normalize(f, cols));
  const rows = frames[0].length;
  const fw = cols * scale;
  const fh = rows * scale;
  const { canvas, ctx } = newCanvas(fw * frames.length, fh);
  frames.forEach((map, f) => paintMap(ctx, map, palette, f * fw, 0, scale));
  const tex = register(scene, key, canvas);
  if (tex && frames.length > 1) {
    for (let f = 0; f < frames.length; f++) tex.add(f, 0, f * fw, 0, fw, fh);
  }
  return tex;
}

/** Bake a single pixel-map into a texture (optionally larger than the map * scale). */
export function bakeSprite(
  scene: Phaser.Scene,
  key: string,
  map: string[],
  palette: Palette,
  scale = 2,
  pad = 0,
) {
  const w = map[0].length * scale + pad * 2;
  const h = map.length * scale + pad * 2;
  const { canvas, ctx } = newCanvas(w, h);
  paintMap(ctx, map, palette, pad, pad, scale);
  register(scene, key, canvas);
}

/**
 * Bake N equal-size frames from a per-frame draw callback into one horizontal
 * spritesheet (like bakeFrames, but the pixels are drawn procedurally instead of
 * authored as a char map — used for the detailed 32px characters). `draw` gets the
 * context already translated so (0,0) is the frame's top-left.
 */
export function bakeDrawnFrames(
  scene: Phaser.Scene,
  key: string,
  count: number,
  fw: number,
  fh: number,
  draw: (ctx: CanvasRenderingContext2D, frame: number) => void,
) {
  const { canvas, ctx } = newCanvas(fw * count, fh);
  for (let f = 0; f < count; f++) {
    ctx.save();
    ctx.translate(f * fw, 0);
    ctx.beginPath();
    ctx.rect(0, 0, fw, fh);
    ctx.clip();
    draw(ctx, f);
    ctx.restore();
  }
  const tex = register(scene, key, canvas);
  if (tex && count > 1) for (let f = 0; f < count; f++) tex.add(f, 0, f * fw, 0, fw, fh);
  return tex;
}

/** Bake from a raw draw callback (for gradient/radial FX where pixels aren't authored). */
export function bakeCanvas(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  const { canvas, ctx } = newCanvas(w, h);
  draw(ctx, w, h);
  register(scene, key, canvas);
}

/** Mirror a pixel map left↔right (for building a right-facing frame from a left one). */
export function mirror(map: string[]): string[] {
  return map.map((row) => row.split("").reverse().join(""));
}

/** Pad/truncate every row to a uniform width so a miscount can't misalign a sprite. */
export function normalize(map: string[], width?: number): string[] {
  const w = width ?? Math.max(...map.map((r) => r.length));
  return map.map((r) => (r.length >= w ? r.slice(0, w) : r + ".".repeat(w - r.length)));
}

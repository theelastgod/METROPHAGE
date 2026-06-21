import type { Palette } from "./pixelart";

// METROPHAGE — character pixel maps (16×16, top-down 3/4). Frame order matches
// faceFrame(): [down, left, right, up]. The PLAYER is grayscale so the class tint
// recolors it (white→bright class hue, darks stay dark, outline stays near-black);
// COP/NPC carry their own hues. `right` is the mirror of `left`.

/** Player palette — grayscale, tinted per class at runtime. */
export const PLAYER_PAL: Palette = {
  ".": undefined,
  o: 0x12131e, // outline (near-black even when tinted)
  a: 0x2b3044, // shadow
  b: 0x474e66, // mid
  c: 0x747c98, // light
  d: 0xbac1d7, // highlight
  e: 0xffffff, // visor / brightest
};

const PLAYER_DOWN = [
  "................",
  ".....oooooo.....",
  "....obbccbbo....",
  "...obdccccdbo...",
  "...obeeeeeebo...",
  "...obeeeeeebo...",
  "...obdccccdbo...",
  "...obbbbbbbbo...",
  "..obeccddccabo..",
  ".obeeccddccaabo.",
  ".obeeccddccaabo.",
  ".obbcccbbcccbbo.",
  "..obbbo..obbbo..",
  "..obbo....obbo..",
  "...oo......oo...",
  "................",
];

const PLAYER_UP = [
  "................",
  ".....oooooo.....",
  "....obbccbbo....",
  "...obdccccdbo...",
  "...obbbaabbbo...",
  "...obbbaabbbo...",
  "...obdccccdbo...",
  "...obbbbbbbbo...",
  "..obeccddccabo..",
  ".obeeccddccaabo.",
  ".obeeccddccaabo.",
  ".obbcccbbcccbbo.",
  "..obbbo..obbbo..",
  "..obbo....obbo..",
  "...oo......oo...",
  "................",
];

const PLAYER_LEFT = [
  "................",
  "....oooooo......",
  "...obbccbbo.....",
  "..obeeeccdbo....",
  "..obeeeccdbbo...",
  "..obeeeccdbo....",
  "...obbccddbo....",
  "...obbbbbbbo....",
  "..obeeccddcabo..",
  ".obeeccddccabo..",
  ".obeeccddccabo..",
  "..obccccbbcbo...",
  "..obbboobbbo....",
  "...obbooobbo....",
  "....oo..oo......",
  "................",
];

export const PLAYER_FRAMES = [PLAYER_DOWN, PLAYER_LEFT, /* right=mirror */ null, PLAYER_UP];

// ── Turing Cop — grayscale, bulkier + heavier than the player, tinted per tier
// (patrol red / enforcer blue / purge orange). A wide hostile visor slit.
export const COP_PAL = PLAYER_PAL;

const COP_DOWN = [
  "................",
  "....oooooo......",
  "...obbbbbbo.....",
  "...obeeeeebo....",
  "...obeeeeebo....",
  "...obbbbbbo.....",
  "..obbbbbbbbo....",
  ".obbccddccbbo...",
  ".obeccddddccbo..",
  ".obeccddddccbo..",
  ".obbccddddccbbo.",
  ".obbcccbbcccbbo.",
  "..obbbo..obbbo..",
  "..obbo....obbo..",
  "..oo......oo....",
  "................",
];

const COP_UP = [
  "................",
  "....oooooo......",
  "...obbbbbbo.....",
  "...obbaabbo.....",
  "...obbaabbo.....",
  "...obbbbbbo.....",
  "..obbbbbbbbo....",
  ".obbccddccbbo...",
  ".obeccddddccbo..",
  ".obeccddddccbo..",
  ".obbccddddccbbo.",
  ".obbcccbbcccbbo.",
  "..obbbo..obbbo..",
  "..obbo....obbo..",
  "..oo......oo....",
  "................",
];

const COP_LEFT = [
  "................",
  "...oooooo.......",
  "..obbbbbbo......",
  "..obeeeccbo.....",
  "..obeeeccbo.....",
  "..obbbbbbo......",
  ".obbbbbbbbo.....",
  ".obeccddccbo....",
  ".obeccddddcbo...",
  ".obeccddddcbo...",
  ".obbccddddcbo...",
  ".obbcccbbccbo...",
  "..obbbobbbo.....",
  "..obbooobbo.....",
  "..oo...oo.......",
  "................",
];

export const COP_FRAMES = [COP_DOWN, COP_LEFT, null, COP_UP];

// ── Friendly NPC (the FIXER contact) — its own lime/yellow colors (not tinted),
// a hood + a glowing yellow antenna bead so it reads as a neutral civilian.
export const NPC_PAL: Palette = {
  ".": undefined,
  o: 0x10180c, // outline
  a: 0x29401a, // dark green
  b: 0x47692c, // mid green
  c: 0x77a848, // light green
  d: 0xbce87a, // highlight
  e: 0xf7ff3c, // antenna + visor (yellow)
};

const NPC_DOWN = [
  ".......e........",
  ".......o........",
  ".....oooooo.....",
  "....oabbbbao....",
  "...oabccccbao...",
  "...oabeeeebao...",
  "...oabccccbao...",
  "...oabbccbbao...",
  "..oabccddccbao..",
  ".oabccddddccbao.",
  ".oabccddddccbao.",
  ".oabbcccbcccbao.",
  "..oabbo.obbao...",
  "..oabo...obao...",
  "...oo.....oo....",
  "................",
];

const NPC_UP = [
  ".......e........",
  ".......o........",
  ".....oooooo.....",
  "....oabbbbao....",
  "...oabbbbbbao...",
  "...oabbaabbao...",
  "...oabccccbao...",
  "...oabbccbbao...",
  "..oabccddccbao..",
  ".oabccddddccbao.",
  ".oabccddddccbao.",
  ".oabbcccbcccbao.",
  "..oabbo.obbao...",
  "..oabo...obao...",
  "...oo.....oo....",
  "................",
];

const NPC_LEFT = [
  "......e.........",
  "......o.........",
  "....oooooo......",
  "...oabbbbao.....",
  "..oabeeccbao....",
  "..oabeeccbao....",
  "...oabccbao.....",
  "...oabbccbao....",
  "..oabccddcbao...",
  ".oabccddddcbao..",
  ".oabccddddcbao..",
  ".oabbcccbccbao..",
  "..oabbobbao.....",
  "..oaboobbao.....",
  "...oo..oo.......",
  "................",
];

export const NPC_FRAMES = [NPC_DOWN, NPC_LEFT, null, NPC_UP];

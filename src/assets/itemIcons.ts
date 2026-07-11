import Phaser from "phaser";

// METROPHAGE — procedural item icons. One 44×44 grayscale silhouette per item "klass"
// (weapon type / gear slot / consumable), baked once into the texture cache. The UI
// renders them as Images tinted by the item's colour, so a magenta katana and a green
// katana share one baked icon but read as different weapons. Grayscale (dark outline →
// metal mid → highlight) keeps the form under tint.

const SIZE = 44;
const OUT = 0x0b0e16; // outline / shadow
const DK = 0x434b5e; // dark metal
const MD = 0x8a93a6; // mid metal
const HI = 0xf0f4fb; // highlight (becomes the tint at full brightness)

export function iconKey(klass: string): string {
  return "icon_" + klass.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

const ICON_KLASSES = [
  // weapons
  "PISTOL", "REVOLVER", "SMG", "MACHINE-PISTOL", "SHOTGUN", "BURST-RIFLE", "MARKSMAN",
  "LMG", "RAILGUN", "FLAK", "LAUNCHER", "ARC", "FLAME", "BLADE", "KATANA",
  // consumables
  "MEDKIT", "SHIELD", "STIM", "HEAT",
  // gear slots
  "WEAPON-MOD", "IMPLANT", "ARMOR", "CHIP",
];

/** Bake every item icon into the cache (idempotent). Call once at boot. */
export function ensureItemIcons(scene: Phaser.Scene) {
  for (const k of ICON_KLASSES) {
    const key = iconKey(k);
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g, k);
    g.generateTexture(key, SIZE, SIZE);
    g.destroy();
  }
}

function draw(g: Phaser.GameObjects.Graphics, klass: string) {
  const R = (x: number, y: number, w: number, h: number, c: number) => g.fillStyle(c, 1).fillRect(x, y, w, h);
  const C = (x: number, y: number, r: number, c: number) => g.fillStyle(c, 1).fillCircle(x, y, r);
  const L = (x1: number, y1: number, x2: number, y2: number, w: number, c: number) => g.lineStyle(w, c, 1).lineBetween(x1, y1, x2, y2);
  const T = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, c: number) => g.fillStyle(c, 1).fillTriangle(x1, y1, x2, y2, x3, y3);
  // gun body helper: dark base + mid body + highlight stripe
  const body = (x: number, y: number, w: number, h: number) => {
    R(x - 1, y - 1, w + 2, h + 2, OUT);
    R(x, y, w, h, MD);
    R(x, y, w, 2, HI);
  };

  switch (klass) {
    case "PISTOL":
      body(12, 17, 16, 7);
      R(27, 18, 8, 3, MD); R(26, 17, 1, 5, OUT); // barrel
      T(13, 24, 19, 24, 14, 33, DK); R(13, 24, 6, 9, DK); R(14, 25, 2, 7, OUT); // grip
      break;
    case "REVOLVER":
      body(13, 17, 14, 7);
      R(27, 18, 7, 3, MD);
      C(20, 21, 5, DK); C(20, 21, 2, HI); // cylinder
      R(14, 24, 6, 10, DK); R(15, 25, 2, 8, OUT);
      break;
    case "SMG":
      body(9, 15, 19, 9);
      R(28, 17, 9, 3, MD); R(27, 16, 1, 6, OUT); // barrel
      R(14, 24, 5, 11, DK); R(15, 25, 2, 9, OUT); // mag
      break;
    case "MACHINE-PISTOL":
      body(12, 16, 14, 8);
      R(26, 18, 6, 3, MD);
      T(15, 24, 21, 24, 13, 35, DK); R(14, 24, 6, 11, DK); // curved mag
      break;
    case "SHOTGUN":
      body(6, 16, 26, 8);
      R(32, 15, 6, 10, MD); R(31, 14, 1, 12, OUT); // wide muzzle
      R(15, 24, 12, 3, DK); // pump
      R(2, 16, 5, 9, DK); R(3, 17, 2, 7, OUT); // stock
      break;
    case "BURST-RIFLE":
      body(6, 17, 28, 6);
      R(34, 18, 4, 2, MD);
      R(12, 12, 11, 4, DK); R(13, 13, 8, 1, HI); // optic rail
      R(2, 16, 5, 8, DK); R(16, 23, 4, 8, DK); // stock + mag
      break;
    case "MARKSMAN":
      body(4, 18, 33, 4);
      C(17, 14, 4, DK); C(17, 14, 1.5, HI); // scope
      R(14, 12, 8, 2, OUT);
      R(1, 16, 5, 9, DK); L(30, 22, 33, 30, 2, DK); // stock + bipod
      break;
    case "LMG":
      body(6, 15, 24, 9);
      R(30, 17, 8, 4, MD);
      R(11, 24, 12, 10, DK); R(12, 25, 9, 1, HI); // box mag
      L(28, 24, 25, 33, 2, DK); L(31, 24, 34, 33, 2, DK); // bipod
      break;
    case "RAILGUN":
      body(5, 17, 28, 6);
      C(15, 20, 4, DK); C(22, 20, 4, DK); C(29, 20, 4, DK); // coils
      C(15, 20, 1.5, HI); C(22, 20, 1.5, HI); C(29, 20, 1.5, HI);
      C(37, 20, 3, HI); // muzzle glow
      R(2, 18, 4, 6, DK);
      break;
    case "FLAK":
      body(8, 15, 18, 11);
      R(25, 13, 9, 15, DK); R(26, 14, 7, 13, MD); R(27, 15, 5, 2, HI); // wide drum muzzle
      R(12, 26, 5, 8, DK);
      break;
    case "LAUNCHER":
      body(6, 16, 26, 8);
      C(33, 20, 6, DK); C(33, 20, 4, OUT); C(33, 20, 2, MD); // muzzle ring
      C(14, 26, 3, HI); // loaded charge
      R(10, 24, 5, 9, DK);
      break;
    case "ARC":
      body(6, 16, 22, 7);
      L(28, 19, 37, 14, 2, HI); L(28, 21, 37, 26, 2, HI); // forked prongs
      C(37, 20, 2.5, HI); C(33, 20, 1.5, HI);
      R(11, 23, 5, 8, DK);
      break;
    case "FLAME":
      R(3, 13, 9, 14, OUT); R(4, 14, 7, 12, DK); R(5, 15, 2, 10, MD); // tank
      body(11, 17, 18, 6);
      R(29, 18, 9, 3, MD); T(38, 16, 38, 23, 43, 19, HI); // nozzle + flame
      break;
    case "BLADE":
      R(11, 24, 6, 9, DK); R(12, 25, 2, 7, OUT); // hilt
      R(9, 22, 10, 3, MD); // guard
      T(16, 23, 19, 20, 36, 9, HI); T(16, 23, 36, 9, 33, 12, MD); // wide energy blade
      break;
    case "KATANA":
      R(9, 28, 6, 7, DK); // hilt
      C(16, 27, 3, MD); // tsuba guard
      g.lineStyle(4, MD, 1).beginPath(); g.moveTo(17, 27); g.lineTo(30, 16); g.lineTo(37, 8); g.strokePath();
      g.lineStyle(1.5, HI, 1).beginPath(); g.moveTo(18, 25); g.lineTo(31, 15); g.lineTo(37, 8); g.strokePath();
      break;
    case "MEDKIT":
      R(8, 12, 28, 22, OUT); R(9, 13, 26, 20, DK); R(9, 13, 26, 5, MD); // case + lid
      R(20, 18, 4, 13, HI); R(15, 23, 14, 4, HI); // cross
      break;
    case "SHIELD":
      T(22, 7, 8, 14, 8, 26, DK); T(22, 7, 36, 14, 36, 26, DK);
      T(22, 38, 8, 26, 36, 26, DK);
      T(22, 12, 13, 16, 13, 25, MD); T(22, 12, 31, 16, 31, 25, MD); T(22, 33, 13, 25, 31, 25, MD);
      C(22, 21, 3, HI);
      break;
    case "STIM":
      g.lineStyle(6, DK, 1).lineBetween(12, 30, 28, 14); // barrel
      g.lineStyle(2.5, HI, 1).lineBetween(13, 29, 27, 15);
      L(28, 14, 34, 8, 3, MD); // needle
      L(8, 34, 14, 28, 4, DK); // plunger
      break;
    case "HEAT":
      R(14, 11, 16, 22, OUT); R(15, 12, 14, 20, DK); R(20, 8, 4, 3, MD); // cell
      T(23, 13, 17, 23, 22, 23, HI); T(22, 21, 27, 21, 21, 31, HI); // bolt
      break;
    case "WEAPON-MOD":
      R(10, 18, 24, 8, OUT); R(11, 19, 22, 6, DK); R(11, 19, 22, 2, MD);
      C(16, 22, 2, HI); C(28, 22, 2, HI); R(20, 14, 4, 5, DK); // a scope/sight mod
      break;
    case "IMPLANT":
      C(22, 22, 11, OUT); C(22, 22, 10, DK); C(22, 22, 6, MD); C(22, 22, 3, HI); // cyber eye
      L(22, 11, 22, 6, 2, MD); L(33, 22, 38, 22, 2, MD); L(22, 33, 22, 38, 2, MD); L(11, 22, 6, 22, 2, MD);
      break;
    case "ARMOR":
      T(22, 8, 9, 13, 11, 30, DK); T(22, 8, 35, 13, 33, 30, DK); // chestplate
      T(11, 30, 33, 30, 22, 36, DK);
      R(20, 12, 4, 20, MD); R(14, 16, 16, 2, HI); // plating seams
      break;
    case "CHIP":
      R(13, 13, 18, 18, OUT); R(14, 14, 16, 16, DK); R(17, 17, 10, 10, MD); R(19, 19, 6, 6, HI);
      for (let i = 0; i < 4; i++) { R(16 + i * 4, 9, 2, 4, MD); R(16 + i * 4, 31, 2, 4, MD); R(9, 16 + i * 4, 4, 2, MD); R(31, 16 + i * 4, 4, 2, MD); } // pins
      break;
    default:
      C(22, 22, 9, MD); C(22, 22, 4, HI);
  }
}

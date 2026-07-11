import { describe, it, expect } from "vitest";
import { sanitizeFurniture, furnitureFits, pieceAt, occupiedTiles, furnitureKind, type FurniturePiece } from "./estates";

// Room is 15×11 with walls on the border → placeable tiles x 1..13, y 1..9; exit mat at [7,9].
const bed = furnitureKind("bed")!; // 2×1
const rug = furnitureKind("rug")!; // 2×2
const chair = furnitureKind("chair")!; // 1×1

describe("furniture placement — footprint aware", () => {
  it("keeps a piece's whole footprint inside the walls", () => {
    expect(furnitureFits(1, 1, chair)).toBe(true);
    expect(furnitureFits(13, 1, chair)).toBe(true); // last floor column
    expect(furnitureFits(13, 1, bed)).toBe(false); // 2-wide would poke into the wall at x=14
    expect(furnitureFits(12, 1, bed)).toBe(true); // occupies 12,13 — fits
    expect(furnitureFits(1, 9, bed)).toBe(true);
    expect(furnitureFits(1, 8, rug)).toBe(true); // occupies rows 8,9
    expect(furnitureFits(1, 9, rug)).toBe(false); // 2-tall would poke into the wall at y=10
    expect(furnitureFits(0, 1, chair)).toBe(false);
  });

  it("never allows a piece onto the exit mat, across the whole footprint", () => {
    expect(furnitureFits(7, 9, chair)).toBe(false); // mat tile
    expect(furnitureFits(6, 9, bed)).toBe(false); // bed 6..7 covers the mat at 7
    expect(furnitureFits(6, 8, rug)).toBe(false); // rug 6..7 × 8..9 covers the mat
  });

  it("rejects overlap with already-placed pieces (footprint, not just anchor)", () => {
    const claimed = occupiedTiles([{ k: "bed", x: 5, y: 5 }]); // covers 5,5 and 6,5
    expect(furnitureFits(5, 5, chair, claimed)).toBe(false);
    expect(furnitureFits(6, 5, chair, claimed)).toBe(false); // the bed's SECOND tile — used to be free
    expect(furnitureFits(7, 5, chair, claimed)).toBe(true);
    expect(furnitureFits(4, 5, bed, claimed)).toBe(false); // 4..5 overlaps the bed at 5
  });

  it("lets anything sit on a rug (rugs are floor cover, not blockers)", () => {
    const claimed = occupiedTiles([{ k: "rug", x: 3, y: 3 }]); // 3..4 × 3..4, but rugs don't block
    expect(claimed.size).toBe(0);
    expect(furnitureFits(3, 3, chair, claimed)).toBe(true);
  });

  it("pieceAt finds a multi-tile piece from any covered tile", () => {
    const pieces: FurniturePiece[] = [{ k: "bed", x: 5, y: 5 }];
    expect(pieceAt(pieces, 5, 5)).toBe(0);
    expect(pieceAt(pieces, 6, 5)).toBe(0); // second tile of the bed
    expect(pieceAt(pieces, 7, 5)).toBe(-1);
  });

  it("sanitizeFurniture drops out-of-bounds, mat, and overlapping pieces", () => {
    const raw: FurniturePiece[] = [
      { k: "bed", x: 12, y: 1 }, // fits (12,13)
      { k: "chair", x: 13, y: 1 }, // overlaps the bed's second tile → dropped
      { k: "bed", x: 13, y: 3 }, // 2-wide poking into wall → dropped
      { k: "chair", x: 7, y: 9 }, // exit mat → dropped
      { k: "plant", x: 2, y: 2 }, // fine
      { k: "bogus", x: 4, y: 4 }, // unknown kind → dropped
    ];
    const out = sanitizeFurniture(raw);
    expect(out).toEqual([
      { k: "bed", x: 12, y: 1 },
      { k: "plant", x: 2, y: 2 },
    ]);
  });

  it("caps a home at 40 pieces", () => {
    const raw: FurniturePiece[] = [];
    for (let i = 0; i < 60; i++) raw.push({ k: "chair", x: 1 + (i % 13), y: 1 + Math.floor(i / 13) });
    expect(sanitizeFurniture(raw).length).toBeLessThanOrEqual(40);
  });
});

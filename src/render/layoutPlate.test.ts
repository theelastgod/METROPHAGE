import { describe, expect, it } from "vitest";
import {
  layoutTagForRoom,
  VENUE_LAYOUTS,
  venueLayoutFor,
  VENUE_ROOM_W,
  VENUE_ROOM_H,
} from "../world/district";
import { HF_LAYOUT_PLATE_TAGS, layoutPlateKey } from "../assets/manifest";

describe("layout floor plates", () => {
  it("has a plate for every layout a zone can be given", () => {
    // venueLayoutFor() hash-picks from VENUE_LAYOUTS; a tag with no plate = a bare floor.
    for (const l of VENUE_LAYOUTS) {
      expect(HF_LAYOUT_PLATE_TAGS, `${l.tag} has no plate`).toContain(l.tag);
    }
  });

  it("claims no plate for a layout that doesn't exist", () => {
    const real = new Set(VENUE_LAYOUTS.map((l) => l.tag));
    for (const tag of HF_LAYOUT_PLATE_TAGS) expect(real).toContain(tag);
  });

  it("keys plates by layout, not by venue kind", () => {
    // The point of the rebuild: one plate per PLAN. A bar and a clinic in the same plan
    // share a floor and differ by furniture.
    expect(layoutPlateKey("hall")).toBe("hf_int_layout_hall");
    expect(new Set(HF_LAYOUT_PLATE_TAGS.map(layoutPlateKey)).size).toBe(HF_LAYOUT_PLATE_TAGS.length);
  });
});

describe("layoutTagForRoom", () => {
  it("returns each layout's own tag for its own dimensions", () => {
    for (const l of VENUE_LAYOUTS) {
      expect(layoutTagForRoom(l.w, l.h), `${l.tag} ${l.w}x${l.h}`).toBe(l.tag);
    }
  });

  it("picks the closest plan for the safehouse-sized service room (20x13)", () => {
    // That call site carries no VenueLayout — 20/13 = 1.54, nearest is loft (1.62).
    expect(layoutTagForRoom(20, 13)).toBe("loft");
  });

  it("picks studio for the classic venue room", () => {
    expect(layoutTagForRoom(VENUE_ROOM_W, VENUE_ROOM_H)).toBe("studio");
  });

  it("never returns a tag without a plate, for any plausible room", () => {
    for (let w = 10; w <= 30; w++) {
      for (let h = 8; h <= 20; h++) {
        expect(HF_LAYOUT_PLATE_TAGS).toContain(layoutTagForRoom(w, h));
      }
    }
  });
});

describe("estate homes", () => {
  it("are pinned to STUDIO, so the estate plate is the studio plate", () => {
    // VENUE_LAYOUTS[0] "MUST stay byte-identical to the original 15x11 room (est homes
    // use it)" — OnlineScene passes "studio" for estate interiors on that basis.
    expect(VENUE_LAYOUTS[0].tag).toBe("studio");
    expect(VENUE_LAYOUTS[0].w).toBe(VENUE_ROOM_W);
    expect(VENUE_LAYOUTS[0].h).toBe(VENUE_ROOM_H);
    expect(venueLayoutFor(null).tag).toBe("studio");
  });
});

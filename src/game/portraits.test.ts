import { describe, expect, it } from "vitest";
import { portraitFor, portraitSheetFallback } from "./portraits";
import {
  HF_RESIDENT_PORTRAIT_SLUGS,
  HF_INTERACT_PORTRAIT_SLUGS,
  HF_NPC_PORTRAIT_SLUGS,
  PORTRAIT_RESIDENTS_KEY,
  portraitInteractKey,
} from "../assets/manifest";
import { hubResident } from "./cityNpcs";

// Residents are only reachable through the accessors; ALL_RESIDENTS is module-private.
// hubResident wraps its roster, so walking well past the end enumerates every one.
const residentIds = [...new Set(Array.from({ length: 64 }, (_, i) => hubResident(i).id))].filter(
  (id) => id.startsWith("res_"),
);

describe("resident portraits", () => {
  it("gives every authored resident their own bust instead of a shared sheet cell", () => {
    for (const slug of HF_RESIDENT_PORTRAIT_SLUGS) {
      const ref = portraitFor(slug, "m");
      expect(ref.key, `${slug} fell back to the shared sheet`).toBe(portraitInteractKey(slug));
      expect(ref.frame).toBe(0); // singles are plain images, not sheet cells
    }
  });

  it("only claims singles for residents that actually exist as NPCs", () => {
    for (const slug of HF_RESIDENT_PORTRAIT_SLUGS) {
      expect(residentIds, `${slug} has a portrait but no NPC`).toContain(slug);
    }
  });

  it("leaves sheet-mapped residents on their painted sheet cell", () => {
    // res_nix..res_quill are 1:1 on residents_sheet.jpg — they must not be overridden.
    const ref = portraitFor("res_nix", "m");
    expect(ref.key).toBe(PORTRAIT_RESIDENTS_KEY);
  });

  it("degrades a missing single to the sheet cell it used before, not to nothing", () => {
    // showBubble calls this when the JPG hasn't loaded; returning undefined would drop
    // the portrait entirely.
    const fb = portraitSheetFallback({ key: portraitInteractKey("res_brick"), frame: 0 });
    expect(fb).toBeDefined();
    expect(fb!.key).toBe(PORTRAIT_RESIDENTS_KEY);
    expect(fb!.frame).toBeGreaterThanOrEqual(0);
    expect(fb!.frame).toBeLessThan(12);
  });

  it("keeps every resident's face stable across calls", () => {
    for (const id of residentIds) {
      expect(portraitFor(id, "m")).toEqual(portraitFor(id, "m"));
    }
  });
});

describe("npc portrait slug lists", () => {
  it("preloads exactly the singles that can be resolved", () => {
    // OnlineScene.preload iterates HF_NPC_PORTRAIT_SLUGS; a slug resolvable by
    // portraitFor but absent here would hand back a key with no texture.
    for (const slug of [...HF_INTERACT_PORTRAIT_SLUGS, ...HF_RESIDENT_PORTRAIT_SLUGS]) {
      expect(HF_NPC_PORTRAIT_SLUGS).toContain(slug);
    }
  });

  it("has no duplicate slugs across the interact and resident lists", () => {
    expect(new Set(HF_NPC_PORTRAIT_SLUGS).size).toBe(HF_NPC_PORTRAIT_SLUGS.length);
  });
});

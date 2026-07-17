import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSETS, deferredWorldAssetsForZone } from "./manifest";

const keys = (zone: string) => new Set(deferredWorldAssetsForZone(zone).map((a) => a.key));

describe("deferred world asset routing", () => {
  it("loads hub art without decoding unrelated dungeon and wilderness packs", () => {
    const hub = keys("safe");
    expect(hub.has("hf_building_bar")).toBe(true);
    expect(hub.has("hf_subway_ghost_train")).toBe(false);
    expect([...hub].some((k) => k.startsWith("hf_wild_"))).toBe(false);
  });

  it("loads only the requested district building kit", () => {
    const d0 = keys("d0");
    expect(d0.has("hf_building_dist_core")).toBe(true);
    expect(d0.has("hf_building_dist_sprawl")).toBe(false);
  });

  it("routes every campaign district to its named exterior kit", () => {
    const expected = ["core", "stacks", "spire", "docks", "undercity", "relay", "wastes", "kernel"];
    expected.forEach((slug, i) => {
      expect(keys(`d${i}`).has(`hf_building_dist_${slug}`), `d${i} should load ${slug}`).toBe(true);
    });
  });

  it("loads subway and venue art on demand", () => {
    expect(keys("subway").has("hf_subway_tunnel_straight")).toBe(true);
    expect(keys("h3").has("hf_int_bar_room")).toBe(true);
  });

  it("keeps the subway handoff within a mobile-safe generated-art decode budget", () => {
    const subway = [...keys("subway")];
    const generatedSubway = subway.filter(
      (key) => key.startsWith("hf_subway_") || key.startsWith("hf_ground_subway_"),
    );
    expect(generatedSubway.length).toBeLessThanOrEqual(70);
    expect(generatedSubway.some((key) => key.startsWith("hf_subway_tile_"))).toBe(true);
    expect(generatedSubway.some((key) => key.startsWith("hf_subway_identity_"))).toBe(true);
  });
});

describe("art coverage — every file-backed manifest entry resolves to a real asset", () => {
  // Missing art degrades SILENTLY (dressers gate on textures.exists), and the browser
  // probe only sees the boot payload now that world art is zone-deferred. This static
  // check is the one that actually proves coverage, so it gates verify:ship via vitest.
  const root = resolve(__dirname, "..", "..");
  // Plain paths live under public/; import.meta.glob-resolved entries (music beds)
  // carry Vite-rooted "/src/…" URLs in dev — both must point at a real file.
  const diskPath = (file: string) =>
    file.startsWith("/src/") ? join(root, file.slice(1)) : join(root, "public", file);

  it("has a real file behind every non-procedural entry", () => {
    const missing: string[] = [];
    for (const [category, list] of Object.entries(ASSETS)) {
      for (const a of list) {
        if (!a.file) continue;
        if (!existsSync(diskPath(a.file))) missing.push(`${category}/${a.key} → ${a.file}`);
      }
    }
    expect(missing, `manifest entries with no file on disk:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every spritesheet's pixel dimensions divide evenly by its declared frame size", async () => {
    // A stub or wrong-sized file "loads successfully" and suppresses the code-baked
    // fallback — cop.png shipped as a 460-byte pill for exactly this reason. Frame
    // divisibility catches stubs, mis-exports, and bad slices; byte size does not.
    const sharp = (await import("sharp")).default;
    const bad: string[] = [];
    for (const list of Object.values(ASSETS)) {
      for (const a of list) {
        if (!a.file || !a.frameWidth || !a.frameHeight) continue;
        const p = diskPath(a.file);
        if (!existsSync(p)) continue; // reported by the coverage test above
        const m = await sharp(p).metadata();
        if (!m.width || !m.height || m.width % a.frameWidth !== 0 || m.height % a.frameHeight !== 0) {
          bad.push(`${a.key} → ${a.file}: ${m.width}x${m.height} not divisible by ${a.frameWidth}x${a.frameHeight}`);
        }
      }
    }
    expect(bad, `spritesheets whose size does not match their frame grid:\n${bad.join("\n")}`).toEqual([]);
  });
});

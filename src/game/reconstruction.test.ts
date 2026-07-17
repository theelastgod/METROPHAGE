import { describe, expect, it } from "vitest";
import { MAX_RECONSTRUCTION, districtReconstruction, reconstructionKey, reconstructionSnapshot } from "./reconstruction";

describe("post-Awakening reconstruction", () => {
  it("authors a persistent consequence for all eight districts", () => {
    for (let district = 0; district < 8; district++) {
      const result = districtReconstruction(district, 1);
      expect(result?.stage).toBe("CREW");
      expect(result?.line.length).toBeGreaterThan(65);
    }
  });

  it("caps durable progress and exposes crew/common/institution stages", () => {
    expect(reconstructionKey(3)).toBe("wake_reconstruction_d3");
    expect(districtReconstruction(0, 2)?.stage).toBe("CREW");
    expect(districtReconstruction(0, 3)?.stage).toBe("COMMON");
    expect(districtReconstruction(0, 6)?.stage).toBe("INSTITUTION");
    const stats = { [reconstructionKey(0)]: 99, [reconstructionKey(1)]: 3 };
    expect(reconstructionSnapshot(stats).slice(0, 2)).toEqual([MAX_RECONSTRUCTION, 3]);
  });
});

import { describe, expect, it } from "vitest";
import { MAX_RESCUE_MEMORY, RESCUES_GIVEN_KEY, RESCUES_RECEIVED_KEY, rescueMemoryContactLine, rescueMemorySnapshot } from "./socialMemory";

describe("party rescue memory", () => {
  it("caps both directions and advances at 1 / 3 / 7 combined rescues", () => {
    expect(rescueMemorySnapshot({}).tier).toBe(0);
    expect(rescueMemorySnapshot({ [RESCUES_GIVEN_KEY]: 1 }).title).toBe("REBOOT WITNESS");
    expect(rescueMemorySnapshot({ [RESCUES_GIVEN_KEY]: 2, [RESCUES_RECEIVED_KEY]: 1 }).title).toBe("LINE KEEPER");
    expect(rescueMemorySnapshot({ [RESCUES_GIVEN_KEY]: 99, [RESCUES_RECEIVED_KEY]: 99 })).toMatchObject({ given: MAX_RESCUE_MEMORY, received: MAX_RESCUE_MEMORY, title: "NO ONE LEFT" });
  });

  it("changes known-contact interpretation based on giving, receiving, or reciprocity", () => {
    expect(rescueMemoryContactLine(rescueMemorySnapshot({ [RESCUES_GIVEN_KEY]: 1 }), 1)).toMatch(/stop for downed/);
    expect(rescueMemoryContactLine(rescueMemorySnapshot({ [RESCUES_RECEIVED_KEY]: 1 }), 1)).toMatch(/carried back/);
    expect(rescueMemoryContactLine(rescueMemorySnapshot({ [RESCUES_GIVEN_KEY]: 1, [RESCUES_RECEIVED_KEY]: 1 }), 1)).toMatch(/Mutual aid/);
    expect(rescueMemoryContactLine(rescueMemorySnapshot({ [RESCUES_GIVEN_KEY]: 1 }), 0)).toBeNull();
  });
});

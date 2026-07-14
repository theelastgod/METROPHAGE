import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetSystemsHintForTests,
  cityChatterLine,
  dismissSystemsHint,
  systemsHintLine,
} from "./systemsHint";

beforeEach(() => {
  __resetSystemsHintForTests();
});

describe("systemsHint", () => {
  it("returns null until first+second done", () => {
    expect(systemsHintLine(false)).toBeNull();
  });

  it("returns systems map once when done", () => {
    const line = systemsHintLine(true);
    expect(line).toMatch(/journal/i);
    dismissSystemsHint();
    expect(systemsHintLine(true)).toBeNull();
  });

  it("city chatter rotates by seed", () => {
    expect(cityChatterLine(0)).toBeTruthy();
    expect(cityChatterLine(1)).not.toBe(cityChatterLine(0));
  });
});

import { describe, expect, it } from "vitest";
import { allowSystemPanel, homeOwnsKey, isSystemHotkey, type KeyContext } from "./inputContext";

const base: KeyContext = {
  zone: "hub",
  inOwnHome: false,
  inHomeAsGuest: false,
  systemsLocked: false,
  isTutorial: false,
};

describe("inputContext", () => {
  it("flags system hotkeys", () => {
    expect(isSystemHotkey("B")).toBe(true);
    expect(isSystemHotkey("m")).toBe(false); // map always open
    expect(isSystemHotkey("i")).toBe(false);
  });

  it("home owns B/G/F over globals", () => {
    expect(homeOwnsKey({ ...base, inOwnHome: true }, "f")).toBe(true);
    expect(homeOwnsKey({ ...base, inHomeAsGuest: true }, "g")).toBe(true);
    expect(homeOwnsKey(base, "b")).toBe(false);
  });

  it("locks systems until fixer talk unless tutorial", () => {
    expect(allowSystemPanel({ ...base, systemsLocked: true })).toBe(false);
    expect(allowSystemPanel({ ...base, systemsLocked: true, isTutorial: true })).toBe(true);
    expect(allowSystemPanel({ ...base, systemsLocked: false })).toBe(true);
  });
});

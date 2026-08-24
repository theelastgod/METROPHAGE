import { describe, expect, it } from "vitest";
import { cleanCallsign, isReservedCallsign, normalizeCallsign } from "./callsign";
import { isGuestPlayerId, isWalletPlayerId, mintGuestId } from "./playerId";
import { randomCallsign } from "./customization";

describe("normalizeCallsign", () => {
  it("matches cleanCallsign for a valid handle", () => {
    expect(normalizeCallsign("neo-reaver")).toBe(cleanCallsign("neo-reaver"));
    expect(normalizeCallsign("NEOREAVER")).toBe("NEOREAVER");
  });

  it("uppercases, strips junk, clamps to 12", () => {
    expect(normalizeCallsign("neo_reaver!!")).toBe("NEOREAVER");
    expect(normalizeCallsign("abcdefghijklmnop")).toBe("ABCDEFGHIJKL");
  });

  it("rejects empty and __-prefixed", () => {
    expect(normalizeCallsign("")).toBe("");
    expect(normalizeCallsign("@@@")).toBe("");
    expect(normalizeCallsign("__FIXER")).toBe("");
    expect(isReservedCallsign("__NPC")).toBe(true);
  });

  it("rejects authored NPCs, FIXER, SYSTEM", () => {
    expect(normalizeCallsign("FIXER")).toBe("");
    expect(normalizeCallsign("SYSTEM")).toBe("");
    expect(normalizeCallsign("RIN")).toBe("");
    expect(normalizeCallsign("DOC HALO")).toBe("");
    expect(normalizeCallsign("GHOST")).toBe("");
  });

  it("keeps a free variant of a reserved stem", () => {
    expect(normalizeCallsign("ECHO-9")).toBe("ECHO-9");
    expect(normalizeCallsign("NEOREAVER")).toBe("NEOREAVER");
  });

  it("randomCallsign never returns a reserved handle", () => {
    expect(normalizeCallsign("STATIC")).toBe("");
    for (let i = 0; i < 40; i++) {
      const s = randomCallsign();
      expect(normalizeCallsign(s), s).toBe(s);
    }
  });
});

describe("player ids are never callsigns", () => {
  it("accepts g:uuid and g:32hex, rejects a name", () => {
    expect(isGuestPlayerId("g:550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isGuestPlayerId("g:" + "a".repeat(32))).toBe(true);
    expect(isGuestPlayerId("neoreaver")).toBe(false);
    expect(isGuestPlayerId("g:NEOREAVER")).toBe(false);
    expect(isGuestPlayerId("g:neoreaver")).toBe(false);
  });

  it("mints a dashed uuid guest id", () => {
    const id = mintGuestId();
    expect(id.startsWith("g:")).toBe(true);
    expect(isGuestPlayerId(id)).toBe(true);
    expect(id.includes("-")).toBe(true);
  });

  it("wallet ids stay w: prefixed", () => {
    expect(isWalletPlayerId("w:0xabc")).toBe(true);
    expect(isWalletPlayerId("0xabc")).toBe(false);
  });
});

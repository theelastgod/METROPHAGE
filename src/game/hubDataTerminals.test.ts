import { describe, expect, it } from "vitest";
import { HUB_DATA_TERMINAL_COOLDOWN_MS, HUB_DATA_TERMINALS, terminalCooldownRemaining } from "./hubDataTerminals";

describe("hub civic archive terminals", () => {
  it("uses three stable, distinct terminal ids and positions", () => {
    expect(new Set(HUB_DATA_TERMINALS.map((n) => n.id)).size).toBe(3);
    expect(new Set(HUB_DATA_TERMINALS.map((n) => `${n.dx},${n.dy}`)).size).toBe(3);
  });

  it("uses a fixed cooldown without clock-underflow bypass", () => {
    expect(terminalCooldownRemaining(1_000, 1_000)).toBe(HUB_DATA_TERMINAL_COOLDOWN_MS);
    expect(terminalCooldownRemaining(1_000, 1_000 + HUB_DATA_TERMINAL_COOLDOWN_MS)).toBe(0);
    expect(terminalCooldownRemaining(2_000, 1_000)).toBe(HUB_DATA_TERMINAL_COOLDOWN_MS);
  });
});

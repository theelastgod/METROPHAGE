import { describe, expect, it } from "vitest";
import { buildZoneWsUrl, withoutStickyInstance } from "./NetClient";

describe("connection routing recovery", () => {
  it("manual recovery drops a stale instance without losing the zone", () => {
    expect(withoutStickyInstance("wss://server.example/ws?zone=safe&inst=3")).toBe(
      "wss://server.example/ws?zone=safe",
    );
  });

  it("preserves unrelated query fields while removing the shard pin", () => {
    expect(withoutStickyInstance("wss://server.example/ws?zone=d2&inst=1&debug=1")).toBe(
      "wss://server.example/ws?zone=d2&debug=1",
    );
  });

  it("still builds a normal zone URL after recovery", () => {
    expect(buildZoneWsUrl("wss://server.example/ws", "tutorial")).toBe(
      "wss://server.example/ws?zone=tutorial",
    );
  });
});

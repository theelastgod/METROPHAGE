import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAUNCH_FLAGS,
  emitDayKey,
  isFeatureDisabled,
  launchFlagsFromEnv,
  parseIntEnv,
} from "./featureFlags";

describe("featureFlags", () => {
  it("defaults all features on", () => {
    const f = launchFlagsFromEnv({});
    expect(f.market).toBe(true);
    expect(f.claimGoal).toBe(true);
    expect(f.districtWar).toBe(true);
    expect(f.hubCap).toBe(DEFAULT_LAUNCH_FLAGS.hubCap);
  });

  it("disables market when METRO_DISABLE_MARKET=1", () => {
    expect(isFeatureDisabled("1")).toBe(true);
    expect(launchFlagsFromEnv({ METRO_DISABLE_MARKET: "1" }).market).toBe(false);
    expect(launchFlagsFromEnv({ METRO_DISABLE_CLAIM_GOAL: "true" }).claimGoal).toBe(false);
    expect(launchFlagsFromEnv({ METRO_DISABLE_DISTRICT_WAR: "off" }).districtWar).toBe(false);
  });

  it("clamps the hub cap", () => {
    expect(parseIntEnv("9999", 48, 8, 200)).toBe(200);
    expect(parseIntEnv("2", 48, 8, 200)).toBe(8);
    expect(launchFlagsFromEnv({ METRO_HUB_CAP: "60" }).hubCap).toBe(60);
  });

  it("emit day key is stable within a day", () => {
    const t = 1_700_000_000_000;
    expect(emitDayKey(t)).toBe(emitDayKey(t + 1000));
  });
});

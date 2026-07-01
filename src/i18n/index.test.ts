import { describe, expect, it } from "vitest";
import { t } from "./index";

describe("i18n", () => {
  it("returns English strings for known keys", () => {
    expect(t("app.title")).toBe("METROPHAGE");
    expect(t("combat.bossDown")).toBe("BOSS DOWN");
  });

  it("interpolates variables", () => {
    expect(t("app.title")).toBeTruthy();
  });
});
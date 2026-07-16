import { describe, expect, it } from "vitest";
import { walletBrowserUrl } from "./walletConnect";

describe("Phantom mobile deep link", () => {
  it("opens the exact live dapp URL in Phantom with an origin ref", () => {
    const page = "https://metrophagev1.pages.dev/?from=mobile#play";
    const link = walletBrowserUrl("phantom", page);
    expect(link).toContain("https://phantom.app/ul/browse/");
    expect(link).toContain(encodeURIComponent(page));
    expect(link).toContain("ref=https://metrophagev1.pages.dev");
  });
});

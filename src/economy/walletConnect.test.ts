import { describe, expect, it } from "vitest";
import { walletBrowserUrl } from "./walletConnect";

describe("EVM mobile browser fallback", () => {
  it("opens the exact live dapp URL in MetaMask", () => {
    const page = "https://metrophagev1.pages.dev/?from=mobile#play";
    const link = walletBrowserUrl("metamask", page);
    expect(link).toBe("https://metamask.app.link/dapp/metrophagev1.pages.dev/?from=mobile#play");
    expect(link).not.toContain("phantom.app/ul/browse");
  });
});

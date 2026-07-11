import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersMobileUx, refreshMobileUxCache } from "./Mobile";

interface BrowserStub {
  ua: string;
  platform?: string;
  maxTouchPoints?: number;
  width?: number;
  height?: number;
  search?: string;
  coarse?: boolean;
  noHover?: boolean;
  uaDataMobile?: boolean;
  uaDataPlatform?: string;
}

function stubBrowser({
  ua,
  platform = "",
  maxTouchPoints = 0,
  width = 1366,
  height = 768,
  search = "",
  coarse = false,
  noHover = false,
  uaDataMobile,
  uaDataPlatform,
}: BrowserStub): void {
  refreshMobileUxCache();
  vi.stubGlobal("window", {
    innerWidth: width,
    innerHeight: height,
    location: { search },
    matchMedia: (query: string) =>
      ({
        matches: query.includes("pointer: coarse")
          ? coarse
          : query.includes("hover: none")
            ? noHover
            : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  } as unknown as Window & typeof globalThis);
  vi.stubGlobal("navigator", {
    userAgent: ua,
    platform,
    maxTouchPoints,
    userAgentData:
      uaDataMobile === undefined
        ? undefined
        : {
            mobile: uaDataMobile,
            platform: uaDataPlatform ?? "",
          },
  } as unknown as Navigator);
}

describe("prefersMobileUx", () => {
  afterEach(() => {
    refreshMobileUxCache();
    vi.unstubAllGlobals();
  });

  it("keeps Windows desktop Chrome on desktop UX even with touch-pointer media quirks", () => {
    stubBrowser({
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      platform: "Win32",
      maxTouchPoints: 10,
      coarse: true,
      noHover: true,
      uaDataMobile: false,
      uaDataPlatform: "Windows",
    });

    expect(prefersMobileUx()).toBe(false);
  });

  it("still enables phone UX for Android Chrome", () => {
    stubBrowser({
      ua: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
      width: 915,
      height: 412,
      coarse: true,
      noHover: true,
      uaDataMobile: true,
      uaDataPlatform: "Android",
    });

    expect(prefersMobileUx()).toBe(true);
  });

  it("still treats iPadOS desktop-mode Safari as mobile UX", () => {
    stubBrowser({
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
      width: 1180,
      height: 820,
      coarse: true,
      noHover: true,
    });

    expect(prefersMobileUx()).toBe(true);
  });

  it("honors the explicit mobile QA override on desktop", () => {
    stubBrowser({
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      platform: "Win32",
      search: "?mobile=1",
      uaDataMobile: false,
      uaDataPlatform: "Windows",
    });

    expect(prefersMobileUx()).toBe(true);
  });
});

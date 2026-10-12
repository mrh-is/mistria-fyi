import { describe, expect, it } from "vitest";

import { isIosDevice } from "./ios-device.js";

const nav = (userAgent: string, platform: string, maxTouchPoints: number) => ({
  maxTouchPoints,
  platform,
  userAgent,
});

const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

describe("isIosDevice", () => {
  it("detects iPhone", () => {
    expect(
      isIosDevice(nav("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iPhone", 5)),
    ).toBe(true);
  });

  it("detects iPadOS reporting a desktop Mac user agent", () => {
    expect(isIosDevice(nav(MAC_UA, "MacIntel", 5))).toBe(true);
  });

  it("does not match a real Mac, Windows, or Android", () => {
    expect(isIosDevice(nav(MAC_UA, "MacIntel", 0))).toBe(false);
    expect(isIosDevice(nav("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32", 0))).toBe(false);
    expect(isIosDevice(nav("Mozilla/5.0 (Linux; Android 14)", "Linux armv8l", 5))).toBe(false);
  });

  it("is false without a navigator", () => {
    expect(isIosDevice(undefined)).toBe(false);
  });
});

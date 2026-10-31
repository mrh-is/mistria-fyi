import { describe, expect, it } from "vitest";

import { detectDevice } from "./device.js";

import type { DeviceSignals } from "./device.js";

const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = IPHONE_SAFARI.replace("Version/18.0", "CriOS/130.0");
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

function signals(
  overrides: Partial<DeviceSignals> & { app?: boolean; fine?: boolean },
): DeviceSignals {
  const { app = false, fine = true, ...rest } = overrides;
  return {
    matchMedia: (query) => ({
      matches: query.includes("pointer: fine") ? fine : query.includes("standalone") && app,
    }),
    maxTouchPoints: 0,
    platform: "Win32",
    userAgent: WINDOWS_CHROME,
    ...rest,
  };
}

describe("detectDevice", () => {
  it("finds a Windows computer by its client hints", () => {
    expect(detectDevice(signals({ userAgentData: { mobile: false } }))).toMatchObject({
      computer: true,
      iosBrowser: false,
      mac: false,
    });
  });

  it("falls back to the user agent & a fine pointer", () => {
    expect(detectDevice(signals({})).computer).toBe(true);
    expect(detectDevice(signals({ fine: false })).computer).toBe(false);
    expect(detectDevice(signals({ fine: false, userAgent: ANDROID })).computer).toBe(false);
  });

  it("finds a Mac without touch", () => {
    expect(detectDevice(signals({ userAgent: MAC_SAFARI }))).toMatchObject({
      computer: true,
      mac: true,
    });
  });

  it("treats an iPad that reports as a Mac as an iOS browser", () => {
    expect(
      detectDevice(signals({ maxTouchPoints: 5, platform: "MacIntel", userAgent: MAC_SAFARI })),
    ).toMatchObject({
      computer: false,
      iosBrowser: true,
      mac: false,
    });
  });

  it("asks the home screen question only outside the app", () => {
    expect(detectDevice(signals({ fine: false, userAgent: IPHONE_SAFARI })).iosBrowser).toBe(true);
    expect(
      detectDevice(signals({ fine: false, standalone: true, userAgent: IPHONE_SAFARI })).iosBrowser,
    ).toBe(false);
    expect(
      detectDevice(signals({ app: true, fine: false, userAgent: IPHONE_SAFARI })).iosBrowser,
    ).toBe(false);
  });

  it("names the iOS browser", () => {
    expect(detectDevice(signals({ userAgent: IPHONE_SAFARI })).browserName).toBe("Safari");
    expect(detectDevice(signals({ userAgent: IPHONE_CHROME })).browserName).toBe("Chrome");
  });
});

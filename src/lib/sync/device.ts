import { isIosDevice } from "#lib/utils/ios-device.js";

/**
 * What the sync page detects about the device (`docs/sync-setup.md` § What the app detects). The
 * checks only show, hide, or word options; none picks a lane, & the page offers overrides.
 */

/** The parts of `navigator` & `window` the checks read, so tests can pass their own. */
export interface DeviceSignals {
  matchMedia: (query: string) => { matches: boolean };
  maxTouchPoints: number;
  platform: string;
  /** Safari's home screen flag. */
  standalone?: boolean;
  userAgent: string;
  /** User-Agent Client Hints, where the browser supports them. */
  userAgentData?: { mobile: boolean };
}

export interface DeviceTraits {
  /** The browser's name, for “Sync in {browser}” on iOS. */
  browserName: string;
  /** A computer rather than a phone or tablet. */
  computer: boolean;
  /** An iPhone or iPad browser, not the home screen app. */
  iosBrowser: boolean;
  /** A Mac, where the game has no build of its own. */
  mac: boolean;
}

const MOBILE_OS = /iPhone|iPad|iPod|Android/;

export function detectDevice(signals: DeviceSignals): DeviceTraits {
  const { maxTouchPoints, userAgent } = signals;
  const ios = isIosDevice(signals);
  const standalone =
    signals.standalone === true || signals.matchMedia("(display-mode: standalone)").matches;
  const computer =
    signals.userAgentData === undefined
      ? !MOBILE_OS.test(userAgent) && !ios && signals.matchMedia("(pointer: fine)").matches
      : !signals.userAgentData.mobile && !ios;
  return {
    browserName: iosBrowserName(userAgent),
    computer,
    iosBrowser: ios && !standalone,
    mac: userAgent.includes("Macintosh") && maxTouchPoints === 0,
  };
}

function iosBrowserName(userAgent: string): string {
  if (userAgent.includes("CriOS")) return "Chrome";
  if (userAgent.includes("FxiOS")) return "Firefox";
  if (userAgent.includes("EdgiOS")) return "Edge";
  return "Safari";
}

/** This browser's traits; a server render assumes a computer, which the page corrects on mount. */
export function currentDevice(): DeviceTraits {
  if (typeof navigator === "undefined" || !("matchMedia" in globalThis)) {
    return { browserName: "Safari", computer: true, iosBrowser: false, mac: false };
  }
  const nav = navigator as Navigator & {
    standalone?: boolean;
    userAgentData?: { mobile: boolean };
  };
  return detectDevice({
    matchMedia: (query) => globalThis.matchMedia(query),
    maxTouchPoints: nav.maxTouchPoints,
    platform: nav.platform,
    standalone: nav.standalone,
    userAgent: nav.userAgent,
    userAgentData: nav.userAgentData,
  });
}

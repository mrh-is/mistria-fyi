type NavigatorLike = Pick<Navigator, "maxTouchPoints" | "platform" | "userAgent">;

/**
 * Detects iOS and iPadOS browsers. iPadOS 13+ sends a desktop Mac user agent, so a "Mac" platform
 * with multi-touch points identifies it; real Macs report zero touch points.
 */
export function isIosDevice(
  nav: NavigatorLike | undefined = (globalThis as { navigator?: NavigatorLike }).navigator,
): boolean {
  if (!nav) {
    return false;
  }
  if (/iP(?:hone|ad|od)/.test(nav.userAgent)) {
    return true;
  }
  return nav.platform === "MacIntel" && nav.maxTouchPoints > 1;
}

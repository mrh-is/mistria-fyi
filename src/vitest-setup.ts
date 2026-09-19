import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

Object.defineProperty(window, "matchMedia", {
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })),
  writable: true,
});

// jsdom has no Web Animations API. Svelte drives `transition:` intros and outros through
// `Element.animate()` and only removes an outroing element once `onfinish` fires, so the stub
// completes on the next macrotask (unless cancelled) instead of leaving outroed nodes in the DOM.
if (typeof Element !== "undefined") {
  Element.prototype.animate = vi.fn(() => {
    let cancelled = false;
    const animation = {
      cancel: () => {
        cancelled = true;
      },
      currentTime: 0,
      effect: null,
      onfinish: null as (() => void) | null,
      playState: "finished",
    };
    setTimeout(() => {
      if (!cancelled) animation.onfinish?.();
    }, 0);
    return animation as unknown as Animation;
  });
}

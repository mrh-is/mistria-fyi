import "@testing-library/jest-dom/vitest";

import { afterAll, vi } from "vitest";

// The `client` project shares one happy-dom document across the files a worker runs (#707).
// Testing Library removes its own containers after each test; this clears anything else a file
// attached, so the next file starts from an empty body.
afterAll(() => {
  document.body.replaceChildren();
});

Object.defineProperty(globalThis, "matchMedia", {
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

// Svelte drives `transition:` intros and outros through `Element.animate()` and only removes an
// outroing element once `onfinish` fires. happy-dom runs animations for their real duration, so
// the stub completes on the next macrotask (unless cancelled) to keep tests fast & deterministic.
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

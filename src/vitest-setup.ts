import "@testing-library/jest-dom/vitest";

const ignoreMediaListener = () => undefined;
Object.defineProperty(globalThis, "matchMedia", {
  value: (query: string) => ({
    addEventListener: ignoreMediaListener,
    addListener: ignoreMediaListener,
    dispatchEvent: () => true,
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: ignoreMediaListener,
    removeListener: ignoreMediaListener,
  }),
  writable: true,
});

// Svelte drives `transition:` intros and outros through `Element.animate()` and only removes an
// outroing element once `onfinish` fires. happy-dom runs animations for their real duration, so
// the stub completes on the next macrotask (unless cancelled) to keep tests fast & deterministic.
if (typeof Element !== "undefined") {
  Element.prototype.animate = () => {
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
  };
}

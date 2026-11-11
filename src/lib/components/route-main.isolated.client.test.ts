import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RouteMain from "./route-main.svelte";

interface NavigationStub {
  complete: Promise<void>;
  from: null | { url: URL };
  to: null | { url: URL };
}

const navigation = vi.hoisted(() => ({
  handlers: [] as ((navigation: NavigationStub) => Promise<void> | undefined)[],
  onNavigate(handler: (navigation: NavigationStub) => Promise<void> | undefined) {
    navigation.handlers.push(handler);
  },
}));

const motion = vi.hoisted(() => ({ prefersReducedMotion: { current: false } }));

vi.mock("$app/navigation", () => navigation);
vi.mock("svelte/motion", () => motion);

const startViewTransition = vi.fn((update: () => Promise<void>) => {
  const finished = update();
  return { finished };
});

beforeEach(() => {
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: startViewTransition,
  });
});

afterEach(() => {
  cleanup();
  navigation.handlers.length = 0;
  motion.prefersReducedMotion.current = false;
  startViewTransition.mockClear();
  Reflect.deleteProperty(document, "startViewTransition");
});

const children = createRawSnippet(() => ({ render: () => "<p>Page</p>" }));

function navigate(from: string, to: string): (Promise<void> | undefined)[] {
  const stub: NavigationStub = {
    complete: Promise.resolve(),
    from: { url: new URL(from, "https://mistria.fyi") },
    to: { url: new URL(to, "https://mistria.fyi") },
  };
  return navigation.handlers.map((handler) => handler(stub));
}

describe("RouteMain", () => {
  it("paints a full load with no motion & no fade", () => {
    render(RouteMain, { children });
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(document.querySelector("main")?.className).not.toContain("fade-in");
  });

  it("turns the page when a client-side navigation changes the path", async () => {
    render(RouteMain, { children });
    const [pending] = navigate("/en/almanac", "/en/museum");
    expect(pending).toBeInstanceOf(Promise);
    await pending;
    expect(startViewTransition).toHaveBeenCalledTimes(1);
  });

  it("cuts straight to the next page under reduced motion", () => {
    motion.prefersReducedMotion.current = true;
    render(RouteMain, { children });
    expect(navigate("/en/almanac", "/en/museum")).toEqual([undefined]);
    expect(startViewTransition).not.toHaveBeenCalled();
  });

  it("doesn't turn the page for a query change on the same page", () => {
    render(RouteMain, { children });
    expect(navigate("/en/everything", "/en/everything?group=source")).toEqual([undefined]);
    expect(startViewTransition).not.toHaveBeenCalled();
  });
});

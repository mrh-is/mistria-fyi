import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TURNING_CLASS, turnPage } from "#lib/components/book/page-turn.js";

const motion = vi.hoisted(() => ({ prefersReducedMotion: { current: false } }));
vi.mock("svelte/motion", () => motion);

interface TransitionStub {
  finish: () => void;
  finished: Promise<undefined>;
  ready: Promise<void>;
  update: Promise<void>;
}

const transitions: TransitionStub[] = [];

const startViewTransition = vi.fn((update: () => Promise<void>) => {
  const { promise: finished, resolve } = Promise.withResolvers<undefined>();
  const transition = {
    finish: () => {
      resolve(undefined);
    },
    finished,
    ready: Promise.resolve(),
    update: update(),
  };
  transitions.push(transition);
  return transition;
});

beforeEach(() => {
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: startViewTransition,
  });
  // The stub has no snapshots, so the turn's animations have no pseudo-elements to run on.
  vi.spyOn(document.documentElement, "animate").mockReturnValue({} as Animation);
});

afterEach(() => {
  motion.prefersReducedMotion.current = false;
  startViewTransition.mockClear();
  transitions.length = 0;
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "startViewTransition");
  document.documentElement.classList.remove(TURNING_CLASS);
});

function navigation(from: string, to: string) {
  return {
    complete: Promise.resolve(),
    from: { url: new URL(from, "https://mistria.fyi") },
    to: { url: new URL(to, "https://mistria.fyi") },
  } as Parameters<typeof turnPage>[0];
}

describe("turnPage", () => {
  it("turns the page when a client-side navigation changes the path", async () => {
    const pending = turnPage(navigation("/en/almanac", "/en/museum"));
    expect(pending).toBeInstanceOf(Promise);
    await pending;
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList).toContain(TURNING_CLASS);
  });

  it("scopes its styles to the turn, dropping them once it finishes", async () => {
    await turnPage(navigation("/en/almanac", "/en/museum"));
    transitions[0]?.finish();
    await transitions[0]?.finished;
    await Promise.resolve();
    expect(document.documentElement.classList).not.toContain(TURNING_CLASS);
  });

  it("keeps the styles for a newer turn when an older one finishes", async () => {
    await turnPage(navigation("/en/almanac", "/en/museum"));
    await turnPage(navigation("/en/museum", "/en/skills"));
    transitions[0]?.finish();
    await transitions[0]?.finished;
    await Promise.resolve();
    expect(document.documentElement.classList).toContain(TURNING_CLASS);
    transitions[1]?.finish();
    await transitions[1]?.finished;
    await Promise.resolve();
    expect(document.documentElement.classList).not.toContain(TURNING_CLASS);
  });

  it("cuts straight to the next page under reduced motion", () => {
    motion.prefersReducedMotion.current = true;
    expect(turnPage(navigation("/en/almanac", "/en/museum"))).toBeUndefined();
    expect(startViewTransition).not.toHaveBeenCalled();
  });

  it("cuts straight to the next page without view transitions", () => {
    Reflect.deleteProperty(document, "startViewTransition");
    expect(turnPage(navigation("/en/almanac", "/en/museum"))).toBeUndefined();
  });

  it("doesn't turn the page for a query change on the same page", () => {
    expect(turnPage(navigation("/en/everything", "/en/everything?group=source"))).toBeUndefined();
    expect(startViewTransition).not.toHaveBeenCalled();
  });
});

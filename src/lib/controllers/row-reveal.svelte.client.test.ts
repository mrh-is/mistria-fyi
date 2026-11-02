import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRowReveal, INITIAL_ROW_BUDGET } from "./row-reveal.svelte.js";

import type { RowReveal } from "./row-reveal.svelte.js";

let queuedFrames: FrameRequestCallback[];

/** Runs the animation frames queued so far, once each. */
function runQueuedFrames(): void {
  const frames = queuedFrames;
  queuedFrames = [];
  for (const onFrame of frames) onFrame(0);
}

/** Lets the current task finish, which refills the shared rows-at-once budget. */
async function nextTask(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Two reveal steps per frame: the deadline check sees 0, then 5, then 10 ms. */
function stepsPerFrame(): void {
  let now = -5;
  vi.spyOn(performance, "now").mockImplementation(() => (now += 5));
}

describe("createRowReveal", () => {
  const cleanups: (() => void)[] = [];

  beforeEach(() => {
    queuedFrames = [];
    vi.stubGlobal("requestAnimationFrame", (onFrame: FrameRequestCallback) => {
      queuedFrames.push(onFrame);
      return queuedFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await nextTask();
  });

  it("keeps its row-height estimate while a frame reveals more rows", () => {
    stepsPerFrame();
    const total = 300;
    const rowHeight = 10;
    let reveal: RowReveal | undefined;
    // The rendered height a ResizeObserver last reported, which lags rows added within a frame.
    const renderedHeight = INITIAL_ROW_BUDGET * rowHeight;
    cleanups.push(
      $effect.root(() => {
        const created = createRowReveal(() => total);
        reveal = created;
        $effect(() => {
          created.measure(renderedHeight);
        });
      }),
    );
    flushSync();
    expect(reveal?.count).toBe(INITIAL_ROW_BUDGET);

    runQueuedFrames();
    flushSync();
    const measuredCount = reveal?.count ?? 0;
    expect(reveal?.reservedHeight).toBe((total - measuredCount) * rowHeight);

    runQueuedFrames();
    flushSync();

    const count = reveal?.count ?? 0;
    expect(count).toBeGreaterThan(INITIAL_ROW_BUDGET);
    expect(reveal?.reservedHeight).toBe((total - count) * rowHeight);
  });

  it("defers reservation changes until after the resize notification & keeps the measured count", () => {
    stepsPerFrame();
    const total = 300;
    let reveal: RowReveal | undefined;
    cleanups.push(
      $effect.root(() => {
        reveal = createRowReveal(() => total);
      }),
    );
    flushSync();
    expect(reveal?.count).toBe(INITIAL_ROW_BUDGET);
    const before = reveal?.reservedHeight;

    // ResizeObserver measures these rows before the next reveal frame adds more.
    reveal?.measure(INITIAL_ROW_BUDGET * 17);
    flushSync();
    expect(reveal?.reservedHeight).toBe(before);

    runQueuedFrames();
    flushSync();
    const count = reveal?.count ?? 0;
    expect(count).toBeGreaterThan(INITIAL_ROW_BUDGET);
    expect(reveal?.reservedHeight).toBe((total - count) * 17);
  });

  it("coalesces resize measurements into one frame using the latest height", () => {
    stepsPerFrame();
    const total = 300;
    let reveal: RowReveal | undefined;
    cleanups.push(
      $effect.root(() => {
        reveal = createRowReveal(() => total);
      }),
    );
    flushSync();
    expect(queuedFrames).toHaveLength(1);

    reveal?.measure(INITIAL_ROW_BUDGET * 21);
    reveal?.measure(INITIAL_ROW_BUDGET * 23);
    expect(queuedFrames).toHaveLength(2);
    runQueuedFrames();
    flushSync();

    expect(reveal?.reservedHeight).toBe((total - (reveal?.count ?? 0)) * 23);
  });

  it("cancels a pending measurement when its list is destroyed", () => {
    let reveal: RowReveal | undefined;
    const cleanup = $effect.root(() => {
      reveal = createRowReveal(() => 300);
    });
    flushSync();
    try {
      reveal?.measure(INITIAL_ROW_BUDGET * 19);
      expect(queuedFrames).toHaveLength(2);
    } finally {
      cleanup();
    }

    expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
  });

  it("shares each frame between waiting lists instead of finishing the oldest first", async () => {
    stepsPerFrame();
    let first: RowReveal | undefined;
    let second: RowReveal | undefined;
    cleanups.push(
      $effect.root(() => {
        first = createRowReveal(() => 500);
      }),
    );
    flushSync();
    await nextTask();
    cleanups.push(
      $effect.root(() => {
        second = createRowReveal(() => 500);
      }),
    );
    flushSync();
    const before = [first?.count ?? 0, second?.count ?? 0];

    runQueuedFrames();
    flushSync();

    expect(first?.count).toBeGreaterThan(before[0]);
    expect(second?.count).toBeGreaterThan(before[1]);
  });

  it("keeps one frame chain when a step makes another list wait", async () => {
    stepsPerFrame();
    let grown = $state(0);
    cleanups.push(
      $effect.root(() => {
        const first = createRowReveal(() => 300);
        createRowReveal(() => grown);
        // A revealed row that mounts or grows another list, as a nested list in a row would.
        $effect(() => {
          if (first.count > INITIAL_ROW_BUDGET) grown = 300;
        });
      }),
    );
    flushSync();
    await nextTask();
    expect(queuedFrames).toHaveLength(1);

    runQueuedFrames();

    expect(queuedFrames).toHaveLength(1);
  });
});

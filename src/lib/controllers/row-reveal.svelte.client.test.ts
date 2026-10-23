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
    expect(reveal?.reservedHeight).toBe((total - INITIAL_ROW_BUDGET) * rowHeight);

    runQueuedFrames();
    flushSync();

    const count = reveal?.count ?? 0;
    expect(count).toBeGreaterThan(INITIAL_ROW_BUDGET);
    expect(reveal?.reservedHeight).toBe((total - count) * rowHeight);
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

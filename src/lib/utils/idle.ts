import { tick } from "svelte";

let pending = 0;
let settled: PromiseWithResolvers<undefined> | undefined;

/** Wait for the current idle chunks and any further chunks their renders schedule. */
export async function whenIdleWorkFinishes(): Promise<void> {
  await settled?.promise;
}

/** A callback queued for the browser's next idle period, or a short timeout where that's missing. */
export function afterIdle(run: () => void): { cancel: () => void } {
  settled ??= Promise.withResolvers<undefined>();
  pending += 1;
  let waiting = true;
  function complete(): void {
    pending -= 1;
    if (pending !== 0) return;
    settled?.resolve(undefined);
    settled = undefined;
  }
  async function runChunk(): Promise<void> {
    waiting = false;
    try {
      run();
    } finally {
      // A chunk can trigger an effect that queues its successor.
      await tick();
      complete();
    }
  }
  let cancel: () => void;
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(() => void runChunk(), { timeout: 500 });
    cancel = () => {
      cancelIdleCallback(handle);
    };
  } else {
    const handle = setTimeout(() => void runChunk(), 16);
    cancel = () => {
      clearTimeout(handle);
    };
  }
  return {
    cancel: () => {
      if (!waiting) return;
      waiting = false;
      cancel();
      complete();
    },
  };
}

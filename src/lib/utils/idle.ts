/** A callback queued for the browser's next idle period, or a short timeout where that's missing. */
export function afterIdle(run: () => void): { cancel: () => void } {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(run, { timeout: 500 });
    return {
      cancel: () => {
        cancelIdleCallback(handle);
      },
    };
  }
  const handle = setTimeout(run, 16);
  return {
    cancel: () => {
      clearTimeout(handle);
    },
  };
}

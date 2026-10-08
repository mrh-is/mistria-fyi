// Local widget completion for feedback UI tests. The server never accepts this synthetic token.
globalThis.turnstile = {
  /** @param {string} _widgetId */
  remove(_widgetId) {
    // This fixture renders no iframe to remove.
  },
  /**
   * @param {HTMLElement} _container
   * @param {Parameters<NonNullable<Window["turnstile"]>["render"]>[1]} options
   */
  render(_container, options) {
    queueMicrotask(() => {
      options.callback?.("browser-fixture-token");
    });
    return "browser-fixture-widget";
  },
  /** @param {string} _widgetId */
  reset(_widgetId) {
    // The UI clears its own token; this fixture has no challenge state to reset.
  },
};

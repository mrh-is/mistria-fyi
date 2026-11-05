import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { holdTurnstileScripts } from "#lib/test-utils/turnstile-script.js";

const TURNSTILE = { remove: vi.fn(), render: vi.fn(), reset: vi.fn() };

let held: ReturnType<typeof holdTurnstileScripts>;

async function load() {
  vi.resetModules();
  return import("./turnstile.js");
}

beforeEach(() => {
  vi.stubGlobal("turnstile", undefined);
  held = holdTurnstileScripts();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ensureTurnstileScript", () => {
  it("does nothing when Turnstile is already here", async () => {
    vi.stubGlobal("turnstile", TURNSTILE);
    const { ensureTurnstileScript } = await load();
    await ensureTurnstileScript();
    expect(held.scripts()).toEqual([]);
  });

  it("shares one download between callers", async () => {
    const { ensureTurnstileScript } = await load();
    const first = ensureTurnstileScript();
    const second = ensureTurnstileScript();
    expect(held.scripts()).toHaveLength(1);
    held.load(TURNSTILE);
    await Promise.all([first, second]);
  });

  it("removes a failed script, then downloads it again on the next attempt", async () => {
    const { ensureTurnstileScript } = await load();
    const failed = ensureTurnstileScript();
    const [element] = held.scripts();
    held.fail();
    await expect(failed).rejects.toThrow("failed to load");
    expect(held.scripts()).toEqual([]);

    const retried = ensureTurnstileScript();
    expect(held.scripts()).toHaveLength(1);
    expect(held.scripts()[0]).not.toBe(element);
    held.load(TURNSTILE);
    await expect(retried).resolves.toBeUndefined();
  });

  it("stops watching once it gives up, even if the script's `load` comes late", async () => {
    vi.useFakeTimers();
    const { ensureTurnstileScript } = await load();
    const attempt = Promise.allSettled([ensureTurnstileScript()]);
    const [element] = held.scripts();
    await vi.advanceTimersByTimeAsync(10_000);
    await attempt;
    element.dispatchEvent(new Event("load"));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts Turnstile from an earlier attempt's late script during a retry", async () => {
    vi.useFakeTimers();
    const { ensureTurnstileScript } = await load();
    const attempt = Promise.allSettled([ensureTurnstileScript()]);
    await vi.advanceTimersByTimeAsync(10_000);
    await attempt;

    const retried = ensureTurnstileScript();
    vi.stubGlobal("turnstile", TURNSTILE);
    await vi.advanceTimersByTimeAsync(50);
    await expect(retried).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives up on a download that never finishes, & starts over next time", async () => {
    vi.useFakeTimers();
    const { ensureTurnstileScript } = await load();
    const attempt = Promise.allSettled([ensureTurnstileScript()]);
    await vi.advanceTimersByTimeAsync(10_000);
    const [result] = await attempt;
    expect(result.status).toBe("rejected");
    expect(held.scripts()).toEqual([]);

    const retried = ensureTurnstileScript();
    expect(held.scripts()).toHaveLength(1);
    held.load(TURNSTILE);
    await retried;
  });
});

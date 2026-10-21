import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updateHolds } from "#lib/pwa/update-holds.js";
import { pageStub, updated } from "#lib/test-utils/page-stub.svelte.js";

import AppUpdater from "./app-updater.svelte";

import type * as SafeReload from "#lib/pwa/safe-reload.js";
import type { afterNavigate, beforeNavigate } from "$app/navigation";

type AfterNavigate = Parameters<Parameters<typeof afterNavigate>[0]>[0];
type BeforeNavigate = Parameters<Parameters<typeof beforeNavigate>[0]>[0];

const { isReachable, navigation, reload } = vi.hoisted(() => ({
  isReachable: vi.fn<() => Promise<boolean>>(),
  navigation: {
    after: [] as ((navigation: AfterNavigate) => void)[],
    afterNavigate(handler: (navigation: AfterNavigate) => void) {
      navigation.after.push(handler);
    },
    before: [] as ((navigation: BeforeNavigate) => void)[],
    beforeNavigate(handler: (navigation: BeforeNavigate) => void) {
      navigation.before.push(handler);
    },
  },
  reload: vi.fn(),
}));

vi.mock("$app/navigation", () => navigation);
vi.mock("#lib/pwa/safe-reload.js", async (importOriginal) => {
  const original = await importOriginal<typeof SafeReload>();
  return {
    ...original,
    createSafeReload: (options: Parameters<typeof original.createSafeReload>[0]) =>
      original.createSafeReload({ ...options, isReachable, reload }),
  };
});

const assign = vi.fn();
const pageReload = vi.fn();

beforeEach(() => {
  isReachable.mockResolvedValue(true);
  // No service worker: a detected deploy is ready to load from the network at once.
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("location", {
    assign,
    href: "https://mistria.fyi/en/almanac",
    pathname: "/en/almanac",
    reload: pageReload,
    search: "",
  });
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  pageStub.reset();
  navigation.after.length = 0;
  navigation.before.length = 0;
  vi.unstubAllGlobals();
});

function linkTo(href: string) {
  const cancel = vi.fn();
  const event = {
    type: "link",
    cancel,
    to: { url: new URL(href) },
    willUnload: false,
  } as unknown as BeforeNavigate;
  for (const handler of navigation.before) handler(event);
  return cancel;
}

/** Plays out the end of a client-side navigation of `type`. */
function landed(type: AfterNavigate["type"]): void {
  for (const handler of navigation.after) handler({ type } as AfterNavigate);
}

describe("app updater", () => {
  it("doesn't reload or redirect navigations without an update", async () => {
    render(AppUpdater);
    await tick();

    const cancel = linkTo("https://mistria.fyi/en/recipes");
    landed("popstate");

    expect(reload).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(pageReload).not.toHaveBeenCalled();
  });

  it("reloads an idle page as soon as an update is ready", async () => {
    render(AppUpdater);
    await tick();

    updated.current = true;
    await tick();

    await vi.waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  it("finishes a busy page's next link client-side, then probes before reloading", async () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    render(AppUpdater);
    await tick();

    updated.current = true;
    await tick();
    expect(reload).not.toHaveBeenCalled();

    const cancel = linkTo("https://mistria.fyi/en/recipes");
    expect(cancel).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();

    dialog.remove();
    location.href = "https://mistria.fyi/en/recipes";
    landed("link");
    await vi.waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
    expect(isReachable).toHaveBeenCalledTimes(1);
  });

  it("lets a held task's navigation run on the old version", async () => {
    const release = updateHolds.hold();
    try {
      render(AppUpdater);
      await tick();
      updated.current = true;
      await tick();

      const cancel = linkTo("https://mistria.fyi/en/recipes");
      landed("goto");

      expect(cancel).not.toHaveBeenCalled();
      expect(pageReload).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });

  it.each(["link", "popstate", "goto"] as const)(
    "keeps an unreachable %s destination client-side and applies the update when online",
    async (type) => {
      isReachable.mockResolvedValue(false);
      const release = updateHolds.hold();
      render(AppUpdater);
      await tick();
      updated.current = true;
      await tick();
      release();

      const cancel = linkTo("https://mistria.fyi/en/recipes");
      location.href = "https://mistria.fyi/en/recipes";
      landed(type);
      await vi.waitFor(() => {
        expect(isReachable).toHaveBeenCalledWith();
      });
      expect(cancel).not.toHaveBeenCalled();
      expect(assign).not.toHaveBeenCalled();
      expect(pageReload).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();

      isReachable.mockResolvedValue(true);
      globalThis.dispatchEvent(new Event("online"));
      await vi.waitFor(() => {
        expect(reload).toHaveBeenCalledTimes(1);
      });
    },
  );

  it("probes where a back or forward navigation landed before reloading", async () => {
    const release = updateHolds.hold();
    render(AppUpdater);
    await tick();
    updated.current = true;
    await tick();
    release();

    landed("popstate");
    await vi.waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
    expect(pageReload).not.toHaveBeenCalled();
  });
});

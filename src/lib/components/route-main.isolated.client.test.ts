import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet, tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

import { routeFade } from "./route-fade.svelte.js";
import RouteMain from "./route-main.svelte";

interface Navigation {
  from: null | { url: URL };
  to: null | { url: URL };
}

const navigation = vi.hoisted(() => ({
  handlers: [] as ((navigation: Navigation) => void)[],
  onNavigate(handler: (navigation: Navigation) => void) {
    navigation.handlers.push(handler);
  },
}));

vi.mock("$app/navigation", () => navigation);

const ORIGIN = "https://mistria.fyi";
const children = createRawSnippet(() => ({ render: () => "<p>Page</p>" }));

afterEach(() => {
  cleanup();
  pageStub.reset();
  routeFade.reset();
  navigation.handlers.length = 0;
});

/** Plays out a client-side navigation from the current page to `path`. */
async function navigate(path: string): Promise<void> {
  const from = { url: new URL(pageStub.url.href) };
  const to = { url: new URL(`${ORIGIN}${path}`) };
  for (const handler of navigation.handlers) handler({ from, to });
  pageStub.url.href = to.url.href;
  await tick();
}

function main(): HTMLElement {
  const element = document.querySelector("main");
  if (!element) throw new Error("no <main>");
  return element;
}

describe("RouteMain", () => {
  it("paints a full load without the fade", () => {
    render(RouteMain, { children });
    expect(main().classList).not.toContain("motion-safe:fade-in");
  });

  it("fades in the new page a client-side navigation mounts", async () => {
    render(RouteMain, { children });
    const before = main();
    await navigate("/en/almanac");
    expect(main()).not.toBe(before);
    expect(main().classList).toContain("motion-safe:fade-in");
  });

  it("leaves the page alone when only the query changes", async () => {
    render(RouteMain, { children });
    await navigate("/en?group=source");
    expect(main().classList).not.toContain("motion-safe:fade-in");
  });

  it("still fades after a remount, as a locale switch causes", async () => {
    const first = render(RouteMain, { children });
    await navigate("/ja");
    first.unmount();
    render(RouteMain, { children });
    expect(main().classList).toContain("motion-safe:fade-in");
  });
});

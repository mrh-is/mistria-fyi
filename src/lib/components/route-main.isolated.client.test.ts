import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet, tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

import RouteMain from "./route-main.svelte";

const navigation = vi.hoisted(() => ({
  handlers: [] as (() => void)[],
  onNavigate(handler: () => void) {
    navigation.handlers.push(handler);
  },
}));

vi.mock("$app/navigation", () => navigation);

afterEach(() => {
  cleanup();
  pageStub.reset();
  navigation.handlers.length = 0;
});

const children = createRawSnippet(() => ({ render: () => "<p>Page</p>" }));

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

  it("fades in the page a client-side navigation lands on", async () => {
    render(RouteMain, { children });
    for (const handler of navigation.handlers) handler();
    pageStub.navigate("/en/almanac");
    await tick();
    expect(main().classList).toContain("motion-safe:fade-in");
  });
});

import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import ThumbTabs from "#lib/components/book/thumb-tabs.svelte";
import * as m from "#lib/paraglide/messages.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

vi.mock("$app/navigation", () => ({ afterNavigate: vi.fn() }));

afterEach(() => {
  cleanup();
  pageStub.reset();
});

function tabs(): HTMLElement {
  return screen.getByRole("navigation", { name: m.book_tabs_label() });
}

function namesToggle(): HTMLElement {
  return within(tabs()).getByRole("button", { name: m.book_tabs_show_names() });
}

describe("ThumbTabs", () => {
  it("names every tab for a screen reader, Home first & Everything last", () => {
    render(ThumbTabs);
    const links = within(tabs()).getAllByRole("link");
    expect(links.at(0)).toHaveAccessibleName(m.book_tab_home());
    expect(links.at(-1)).toHaveAccessibleName(m.home_everything_label());
    expect(links).toHaveLength(12);
  });

  it("marks the tab for the page you're on", () => {
    pageStub.navigate("/en/museum");
    render(ThumbTabs);
    const current = within(tabs()).getByRole("link", { current: "page" });
    expect(current).toHaveAttribute("href", "/en/museum");
  });

  it("marks no tab on a page without one", () => {
    pageStub.navigate("/en/about");
    render(ThumbTabs);
    expect(within(tabs()).queryByRole("link", { current: "page" })).toBeNull();
  });

  it("turns tab names on & off by click or Escape, for touch & keyboard", async () => {
    render(ThumbTabs);
    expect(namesToggle()).toHaveAttribute("aria-pressed", "false");
    await fireEvent.click(namesToggle());
    expect(namesToggle()).toHaveAttribute("aria-pressed", "true");
    expect(tabs().classList).toContain("thumb-tabs--labeled");
    await fireEvent.keyDown(globalThis.window, { key: "Escape" });
    expect(namesToggle()).toHaveAttribute("aria-pressed", "false");
  });

  it("goes inert while a panel is open, so a tab can't navigate away from a draft", () => {
    render(ThumbTabs, { inert: true });
    expect(tabs()).toHaveAttribute("inert");
  });
});

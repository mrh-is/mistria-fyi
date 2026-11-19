import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ToolbarFooterHarness from "#lib/components/toolbar-footer.test-harness.svelte";
import { trackingReminders } from "#lib/controllers/tracking-reminders.svelte.js";
import { SOURCE_FILTERS } from "#lib/data/source-filters.js";
import { FeedbackContext } from "#lib/feedback/context.svelte.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

import type { PageMetadataInput } from "#lib/data/page-metadata.js";

const navigation = vi.hoisted(() => ({
  afterNavigate:
    vi.fn<(callback: (navigation: { type: string; shallow: boolean }) => void) => void>(),
  onNavigate: vi.fn(),
}));
vi.mock("$app/navigation", () => navigation);

vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));

// Both the toolbar & the thumb tabs listen, so a navigation reaches every registered callback.
function afterNavigate(): void {
  for (const [onNavigated] of navigation.afterNavigate.mock.calls) {
    onNavigated({ type: "link", shallow: false });
  }
}

// The shell makes the page inert while a panel is open or the picker runs.
function overlayState() {
  return screen.getByTestId("page-content").closest("[inert]") ? "active" : "inactive";
}

function renderToolbar(toolbar?: PageMetadataInput["toolbar"]) {
  const resolvedToolbar = toolbar ?? { clock: true, filter: true, search: true };
  const feedbackContext = new FeedbackContext();
  const view = render(ToolbarFooterHarness, {
    feedbackContext,
    metadata: { description: "Test page.", title: "Test", toolbar: resolvedToolbar },
  });
  return { ...view, feedbackContext };
}

function toolbarNav() {
  // By label, not role: a picking toolbar is `hidden`, and the thumb tabs are a navigation too.
  const nav = document.querySelector('nav[aria-label="Field guide tools"]');
  if (!(nav instanceof HTMLElement)) throw new Error("no toolbar navigation");
  return nav;
}

function settingsButton() {
  return screen.getByRole("button", { name: "Quick settings" });
}

function visibilityButton() {
  return screen.getByRole("button", { name: "Visibility filters" });
}

beforeEach(() => {
  pageStub.reset();
  navigation.afterNavigate.mockClear();
  vi.stubGlobal("turnstile", {
    remove: vi.fn(),
    render: vi.fn(() => "test-widget"),
    reset: vi.fn(),
  });
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  toolbarState.closeSearch();
  toolbarState.unregisterSourceFilters("test");
  toolbarState.unregisterSourceFilters("almanac");
  toolbarState.showUnobtainable = false;
  userState.resetAll();
  trackingReminders.clearClockHint();
  // Flush pending Svelte microtasks after unmount and state reset.
  await tick();
});

describe("ToolbarFooter panels", () => {
  it.each(["Search", "Quick settings"])(
    "keeps replacement %s focus when feedback closes",
    async (replacement) => {
      renderToolbar();
      const feedback = screen.getByRole("button", { name: "Send feedback" });
      feedback.focus();
      await fireEvent.click(feedback);
      await waitFor(() =>
        expect(screen.getByRole("dialog", { name: "Send feedback" })).toHaveFocus(),
      );
      const trigger =
        replacement === "Search"
          ? screen.getByRole("textbox", { name: "Search items" })
          : screen.getByRole("button", { name: replacement });
      trigger.focus();
      await fireEvent.click(trigger);
      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Send feedback" })).toBeNull();
      });
      expect(
        screen.getByRole(replacement === "Search" ? "textbox" : "button", {
          name: replacement === "Search" ? "Search items" : "Close Quick settings",
        }),
      ).toHaveFocus();
    },
  );

  it("opens & closes a panel from the rail's Settings", async () => {
    renderToolbar();
    await fireEvent.click(settingsButton());
    expect(settingsButton()).toHaveAttribute("aria-expanded", "true");
    await screen.findByRole("dialog", { name: "Quick settings" });
    await fireEvent.click(settingsButton());
    expect(settingsButton()).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the rail's tools live but the tabs inert behind an open panel", async () => {
    renderToolbar();
    await fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await screen.findByRole("dialog", { name: "Send feedback" });
    const tabs = document.querySelector('nav[aria-label="Thumb index"]');
    expect(tabs).toHaveAttribute("inert");
    expect(settingsButton().closest("[inert]")).toBeNull();
  });

  it("lists the thumb tabs in the Contents panel", async () => {
    renderToolbar();
    await fireEvent.click(screen.getByRole("button", { name: "Contents" }));
    await screen.findByRole("heading", { name: "Contents" });
    const panel = document.querySelector("#contents-panel");
    if (!(panel instanceof HTMLElement)) throw new Error("no Contents panel");
    expect(within(panel).getAllByRole("link")).toHaveLength(12);
  });

  it("opens one panel at a time and reflects the open panel in aria-expanded", async () => {
    renderToolbar();

    await fireEvent.click(settingsButton());
    expect(settingsButton()).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("dialog", { name: "Quick settings" })).toBeInTheDocument();
    expect(overlayState()).toBe("active");

    await fireEvent.click(visibilityButton());
    expect(await screen.findByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(settingsButton()).toHaveAttribute("aria-expanded", "false");
    expect(visibilityButton()).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Quick settings" })).toBeNull();
    });

    await fireEvent.click(visibilityButton());
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(visibilityButton()).toHaveAttribute("aria-expanded", "false");
    expect(overlayState()).toBe("inactive");
  });

  it("closes an open panel on Escape and returns focus to the opener", async () => {
    renderToolbar();

    settingsButton().focus();
    await fireEvent.click(settingsButton());
    const dialog = await screen.findByRole("dialog", { name: "Quick settings" });
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    await fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(settingsButton()).toHaveFocus();
    });
  });

  it("dismisses a nested spoiler dialog without closing the settings panel", async () => {
    renderToolbar();
    await fireEvent.click(settingsButton());
    await fireEvent.click(screen.getByRole("switch", { name: "Show spoilers?" }));
    const confirmation = await screen.findByRole("dialog", { name: "Show spoilers?" });
    const cancel = within(confirmation).getByRole("button", { name: "Never mind" });
    cancel.focus();
    await fireEvent.keyDown(cancel, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Show spoilers?" })).toBeNull();
    });
    expect(screen.getByRole("dialog", { name: "Quick settings" })).toBeInTheDocument();
    expect(settingsButton()).toHaveAttribute("aria-expanded", "true");
  });

  it("closes the panel from the backdrop", async () => {
    renderToolbar();

    await fireEvent.click(visibilityButton());
    await screen.findByRole("dialog", { name: "Filters" });

    await fireEvent.click(screen.getByLabelText("Close panel"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("closes the panel from its own close button", async () => {
    renderToolbar();

    await fireEvent.click(visibilityButton());
    const dialog = await screen.findByRole("dialog", { name: "Filters" });

    await fireEvent.click(within(dialog).getByRole("button", { name: "Close Filters" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("closes an open panel when the route changes", async () => {
    renderToolbar();

    await fireEvent.click(settingsButton());
    await screen.findByRole("dialog", { name: "Quick settings" });

    pageStub.navigate("/en/museum");
    afterNavigate();

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(settingsButton()).toHaveAttribute("aria-expanded", "false");
  });

  it("preserves a feedback draft on dismiss but remounts it on navigation", async () => {
    renderToolbar();
    const feedbackButton = screen.getByRole("button", { name: "Send feedback" });
    await fireEvent.click(feedbackButton);
    await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Draft feedback" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Close Send feedback" }));
    await fireEvent.click(feedbackButton);
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Draft feedback");
    pageStub.navigate("/en/museum");
    afterNavigate();
    await tick();
    await fireEvent.click(feedbackButton);
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  });

  it("cancels pending search updates when the toolbar unmounts", async () => {
    vi.useFakeTimers();
    try {
      const view = renderToolbar();
      await fireEvent.input(screen.getByRole("textbox", { name: "Search items" }), {
        target: { value: "stale query" },
      });
      view.unmount();
      await vi.advanceTimersByTimeAsync(250);
      expect(toolbarState.searchQuery).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks the overlay active and hides the toolbar while the feedback picker runs", async () => {
    const { feedbackContext } = renderToolbar();
    const nav = screen.getByRole("navigation", { name: "Field guide tools" });

    expect(overlayState()).toBe("inactive");
    feedbackContext.startPicking(() => undefined);

    await waitFor(() => {
      expect(overlayState()).toBe("active");
    });
    expect(nav).not.toBeVisible();

    feedbackContext.cancel();
    await waitFor(() => {
      expect(overlayState()).toBe("inactive");
    });
  });

  it("renders nothing while hidden", () => {
    renderToolbar("hidden");

    expect(screen.queryByRole("navigation", { name: "Field guide tools" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Search items" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Quick settings" })).toBeNull();
  });
});

describe("ToolbarFooter search", () => {
  it("offers search only when the page's toolbar config enables it", () => {
    renderToolbar({ search: false });
    expect(screen.queryByRole("textbox", { name: "Search items" })).toBeNull();
    cleanup();

    renderToolbar({ search: true });
    expect(screen.getByRole("textbox", { name: "Search items" })).toBeInTheDocument();
  });

  it("keeps the field on the page, opens a search on focus, and debounces the query", async () => {
    renderToolbar();
    const input = screen.getByRole("textbox", { name: "Search items" });

    input.focus();
    expect(toolbarState.searchOpen).toBe(true);

    await fireEvent.input(input, { target: { value: "tomato" } });
    expect(toolbarState.searchQuery).toBe("");

    await waitFor(() => {
      expect(toolbarState.searchQuery).toBe("tomato");
    });
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  });

  it("clears the query and keeps the field", async () => {
    renderToolbar();
    toolbarState.setSearchQuery("bread");

    await fireEvent.click(await screen.findByRole("button", { name: "Clear search" }));

    expect(toolbarState.searchQuery).toBe("");
    expect(screen.getByRole("textbox", { name: "Search items" })).toHaveValue("");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    });
  });

  it("clears the search with Escape and leaves the field", async () => {
    renderToolbar();
    const input = screen.getByRole("textbox", { name: "Search items" });
    input.focus();
    toolbarState.setSearchQuery("bread");

    await fireEvent.keyDown(input, { key: "Escape" });

    expect(toolbarState.searchQuery).toBe("");
    expect(toolbarState.searchOpen).toBe(false);
    expect(input).not.toHaveFocus();
  });

  it("closes any open panel when the search field takes focus", async () => {
    renderToolbar();
    await fireEvent.click(settingsButton());
    await screen.findByRole("dialog", { name: "Quick settings" });

    screen.getByRole("textbox", { name: "Search items" }).focus();

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

describe("ToolbarFooter filters", () => {
  it("includes unobtainable rows in filter status and reset", async () => {
    toolbarState.registerSourceFilters("almanac", []);
    renderToolbar();
    await fireEvent.click(visibilityButton());
    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    await fireEvent.click(within(dialog).getByRole("switch", { name: "Unobtainable" }));
    expect(toolbarState.showUnobtainable).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Filters applied");
    await fireEvent.click(within(dialog).getByRole("button", { name: "Reset" }));
    expect(toolbarState.showUnobtainable).toBe(false);
    expect(visibilityButton()).not.toHaveClass("floating-tool--filtered");
  });

  it("shows a reset action once a source filter narrows & clears it", async () => {
    const [first, second] = SOURCE_FILTERS;
    toolbarState.registerSourceFilters("test", [first, second]);
    renderToolbar();
    await fireEvent.click(visibilityButton());
    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    expect(within(dialog).queryByRole("button", { name: "Reset" })).toBeNull();
    expect(visibilityButton()).not.toHaveClass("floating-tool--filtered");

    toolbarState.toggleSourceFilter(first);
    const reset = await within(dialog).findByRole("button", { name: "Reset" });

    await fireEvent.click(reset);

    expect(toolbarState.isSourceFilterNarrowing).toBe(false);
    await waitFor(() => {
      expect(within(dialog).queryByRole("button", { name: "Reset" })).toBeNull();
    });
    expect(screen.getByRole("status")).toHaveTextContent("All filters cleared");
  });

  it("highlights the filter trigger while filters are active and the panel is closed", async () => {
    const [first, second] = SOURCE_FILTERS;
    toolbarState.registerSourceFilters("test", [first, second]);
    toolbarState.toggleSourceFilter(first);
    renderToolbar();

    await waitFor(() => {
      expect(visibilityButton()).toHaveClass("floating-tool--filtered");
    });
  });
});

function clockButton() {
  return screen.getByRole("button", { name: /^Season & weather/ });
}

describe("ToolbarFooter clock", () => {
  it("puts search, filter, & clock in that order, so the tab sits at the screen edge", () => {
    renderToolbar({ clock: true, filter: true, search: true });

    const controls = [...toolbarNav().querySelectorAll("button, input")];
    expect(
      controls.slice(-3).map((control) => control.getAttribute("aria-label") ?? control.id),
    ).toEqual(["tracker-search", "Visibility filters", "Season & weather: Spring, Sun"]);
    expect(clockButton().querySelector("[data-clock-tab]")).toBeInTheDocument();
  });

  it("opens the season & weather panel from the clock", async () => {
    renderToolbar({ clock: true });

    await fireEvent.click(clockButton());

    const dialog = await screen.findByRole("dialog", { name: "Season & weather" });
    expect(within(dialog).getByRole("radiogroup", { name: "Season" })).toBeInTheDocument();
  });

  it("shows a dot & a hint label until the clock opens", async () => {
    renderToolbar({ clock: true });
    expect(clockButton().querySelector("[data-clock-dot]")).toBeNull();

    await trackingReminders.chooseHandTracking();
    await tick();
    expect(clockButton().querySelector("[data-clock-dot]")).toBeInTheDocument();
    expect(clockButton()).toHaveAccessibleName(/This sorts your lists/);

    await fireEvent.click(clockButton());
    expect(clockButton().querySelector("[data-clock-dot]")).toBeNull();
    expect(clockButton()).not.toHaveAccessibleName(/This sorts your lists/);
  });

  it("leaves the clock & filter to each page's config", () => {
    renderToolbar({ search: true });

    expect(screen.queryByRole("button", { name: /^Season & weather/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Visibility filters" })).toBeNull();
  });
});

describe("ToolbarFooter picker state", () => {
  it("hides the toolbar & marks the page overlay-active while the panel's picker runs", async () => {
    const { feedbackContext } = renderToolbar();
    const target = document.createElement("div");
    document.body.append(target);
    feedbackContext.reportableAttachment({
      category: "recipe",
      displayName: "Tomato Soup",
      page: "/recipes",
    })(target);

    await fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await fireEvent.click(await screen.findByRole("button", { name: "Point at something" }));

    // `FeedbackPanel` starts picking; the toolbar and the shell's `inert` are other components
    // reading the same context.
    await waitFor(() => {
      expect(toolbarNav()).toHaveAttribute("hidden");
      expect(overlayState()).toBe("active");
    });

    await fireEvent.click(screen.getByRole("button", { name: "Cancel item picker" }));
    await waitFor(() => {
      expect(toolbarNav()).not.toHaveAttribute("hidden");
    });
    expect(feedbackContext.isPicking).toBe(false);

    target.remove();
  });
});

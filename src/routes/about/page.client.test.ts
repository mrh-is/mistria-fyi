import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createNavigationHistory, navigationHistoryKey } from "#lib/navigation-history.js";

import AboutPage from "./+page.svelte";

afterEach(async () => {
  Reflect.deleteProperty(globalThis.history, "length");
  await tick();
});

describe("About page navigation and disclosures", () => {
  it("returns through browser history when history is available", async () => {
    const navigationHistory = createNavigationHistory();
    const stop = navigationHistory.start();
    globalThis.history.pushState({}, "");
    const back = vi.spyOn(globalThis.history, "back").mockReturnValue(undefined);
    render(AboutPage, { context: new Map([[navigationHistoryKey, navigationHistory]]) });

    await fireEvent.click(screen.getByRole("link", { name: "Go back" }));

    expect(back).toHaveBeenCalledTimes(1);
    stop();
  });

  it("links the generated open-source license notices from the About footer", () => {
    render(AboutPage);

    expect(screen.getByRole("link", { name: "Open-source licenses" })).toHaveAttribute(
      "href",
      "/licenses.txt",
    );
  });

  it("opens the AI disclosure from the About footer", async () => {
    render(AboutPage);

    await fireEvent.click(screen.getByRole("button", { name: "AI disclosure" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Built with AI assistance")).toBeInTheDocument();
  });
});

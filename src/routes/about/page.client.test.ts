import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import AboutPage from "./+page.svelte";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window.history, "length");
});

describe("About page navigation and disclosures", () => {
  it("returns through browser history when history is available", async () => {
    Object.defineProperty(window.history, "length", { configurable: true, value: 2 });
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    render(AboutPage);

    await fireEvent.click(screen.getByRole("link", { name: "Go back" }));

    expect(back).toHaveBeenCalledOnce();
  });

  it("opens the AI disclosure from the About footer", async () => {
    render(AboutPage);

    await fireEvent.click(screen.getByRole("button", { name: "AI disclosure" }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Built with AI assistance")).toBeTruthy();
  });
});

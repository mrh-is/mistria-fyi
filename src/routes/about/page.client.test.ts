import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import AboutPage from "./+page.svelte";

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis.history, "length");
  await tick();
});

describe("About page navigation and disclosures", () => {
  it("returns through browser history when history is available", async () => {
    Object.defineProperty(globalThis.history, "length", { configurable: true, value: 2 });
    const back = vi.spyOn(globalThis.history, "back").mockReturnValue(undefined);
    render(AboutPage);

    await fireEvent.click(screen.getByRole("link", { name: "Go back" }));

    expect(back).toHaveBeenCalledTimes(1);
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

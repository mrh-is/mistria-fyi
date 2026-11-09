import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import AboutPage from "./+page.svelte";

describe("About page navigation and disclosures", () => {
  it("links the header arrow to home", () => {
    render(AboutPage);
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/en");
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

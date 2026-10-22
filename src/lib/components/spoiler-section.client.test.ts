import { fireEvent, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, it } from "vitest";

import SpoilerSection from "#lib/components/spoiler-section.svelte";

const children = createRawSnippet(() => ({
  render: () => `<p data-testid="revealed-section">Revealed section</p>`,
}));

describe("SpoilerSection", () => {
  it("makes the whole hidden header, on the shared trigger surface, the one reveal button", () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: true });

    const header = view.getByRole("button", { name: "Reveal spoiler" });
    expect(header).toHaveAttribute("data-section-trigger");
    // The mask inside is presentational, so there's no second, nested button.
    expect(view.getAllByRole("button")).toHaveLength(1);
    expect(view.getByTestId("spoiler-cover-mask")).toBeInTheDocument();
    expect(view.queryByTestId("revealed-section")).not.toBeInTheDocument();
  });

  it("styles the hidden header's disclosure & name like a visible section's", () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: true });

    const header = view.getByRole("button", { name: "Reveal spoiler" });
    expect(header.querySelector(".section-disclosure")).toBeInTheDocument();
    expect(header.querySelector(".text-muted-foreground")).toBeNull();
    expect(header.querySelector(".font-semibold")).toBeInTheDocument();
  });

  it("shows no progress on the hidden header", () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: true });

    expect(view.queryByTestId("section-progress")).not.toBeInTheDocument();
    expect(view.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });

  it("renders the section itself once the spoiler is revealed", async () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: true });

    // Anywhere on the row reveals it, not only the mask.
    await fireEvent.click(view.getByRole("button", { name: "Reveal spoiler" }));

    expect(view.getByTestId("revealed-section")).toBeInTheDocument();
    expect(view.container.querySelector("[data-section-trigger]")).not.toBeInTheDocument();
  });

  it("renders the section directly when not spoilered", () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: false });

    expect(view.getByTestId("revealed-section")).toBeInTheDocument();
  });
});

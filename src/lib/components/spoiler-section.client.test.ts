import { fireEvent, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, it } from "vitest";

import SpoilerSection from "#lib/components/spoiler-section.svelte";

const children = createRawSnippet(() => ({
  render: () => `<p data-testid="revealed-section">Revealed section</p>`,
}));

describe("SpoilerSection", () => {
  it("makes the spoiler mask, not the header row, the one reveal button", () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: true });

    const header = view.container.querySelector("[data-section-trigger]");
    expect(header?.tagName).toBe("DIV");
    expect(view.getAllByRole("button")).toHaveLength(1);
    expect(header).toContainElement(view.getByRole("button", { name: "Reveal spoiler" }));
    expect(view.queryByTestId("revealed-section")).not.toBeInTheDocument();
  });

  it("leaves the section hidden when the row outside the mask is clicked", async () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: true });

    const header = view.container.querySelector("[data-section-trigger]");
    expect(header).toBeInstanceOf(HTMLElement);
    await fireEvent.click(header as HTMLElement);

    expect(view.queryByTestId("revealed-section")).not.toBeInTheDocument();
  });

  it("styles the hidden header's disclosure & name like a visible section's", () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: true });

    const header = view.container.querySelector("[data-section-trigger]");
    expect(header?.querySelector(".section-disclosure")).toBeInTheDocument();
    expect(header?.querySelector(".text-muted-foreground")).toBeNull();
    expect(header?.querySelector(".font-semibold")).toBeInTheDocument();
  });

  it("shows no progress on the hidden header", () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: true });

    expect(view.queryByTestId("section-progress")).not.toBeInTheDocument();
    expect(view.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });

  it("renders the section itself once the spoiler is revealed", async () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: true });

    await fireEvent.click(view.getByRole("button", { name: "Reveal spoiler" }));

    expect(view.getByTestId("revealed-section")).toBeInTheDocument();
    expect(view.container.querySelector("[data-section-trigger]")).not.toBeInTheDocument();
  });

  it("renders the section directly when not spoilered", () => {
    const view = render(SpoilerSection, { children, name: "Town Quests", spoilered: false });

    expect(view.getByTestId("revealed-section")).toBeInTheDocument();
  });
});

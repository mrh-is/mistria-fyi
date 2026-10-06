import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import IconCategory from "#lib/components/icon/icon-category.svelte";

function iconStroke(container: HTMLElement): null | string {
  return container.querySelector("svg")?.getAttribute("stroke") ?? null;
}

describe("IconCategory", () => {
  it("colors the completed-categories icon with the completion role token", () => {
    const { container } = render(IconCategory, { category: "complete", useCategoryColor: true });

    expect(iconStroke(container)).toBe("var(--color-progress-complete)");
  });

  it("leaves the icon on its inherited color without useCategoryColor", () => {
    const { container } = render(IconCategory, { category: "complete" });

    expect(iconStroke(container)).toBe("currentColor");
  });
});

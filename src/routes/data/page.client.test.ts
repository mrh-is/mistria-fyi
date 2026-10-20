import { cleanup, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

import DataPage from "./+page.svelte";

function trigger(name: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(name) });
}

beforeEach(() => {
  pageStub.reset();
});

afterEach(async () => {
  cleanup();
  await tick();
});

describe("data management deep links", () => {
  it("opens the tool `?section=` names once the page is in the browser", async () => {
    pageStub.navigate("/en/data?section=transfer");

    render(DataPage);
    await tick();

    expect(trigger("Transfer to Another Device")).toHaveAttribute("aria-expanded", "true");
    expect(trigger("Import from Save File")).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the import tool for `?section=import`", async () => {
    pageStub.navigate("/en/data?section=import");

    render(DataPage);
    await tick();

    expect(trigger("Import from Save File")).toHaveAttribute("aria-expanded", "true");
    expect(trigger("Transfer to Another Device")).toHaveAttribute("aria-expanded", "false");
  });

  it("leaves every tool closed without a recognized section", async () => {
    pageStub.navigate("/en/data?section=elsewhere");

    render(DataPage);
    await tick();

    expect(trigger("Import from Save File")).toHaveAttribute("aria-expanded", "false");
    expect(trigger("Transfer to Another Device")).toHaveAttribute("aria-expanded", "false");
  });
});

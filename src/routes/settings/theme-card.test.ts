import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import { theme } from "$lib/stores/theme.svelte.js";

import ThemeCard from "./theme-card.svelte";

afterEach(() => {
  theme.set("system");
});

describe("ThemeCard", () => {
  it("starts collapsed with the current preference in its header", () => {
    theme.set("dark");

    const { body } = render(ThemeCard, { props: { open: false } });

    expect(body).toContain('aria-expanded="false"');
    expect(body).toContain("Current preference: Dark");
  });

  it("keeps its controls mounted while collapsed", () => {
    const { body } = render(ThemeCard, { props: { open: false } });

    expect(body).toContain('data-slot="collapsible-content"');
    expect(body).toContain('data-state="closed"');
    expect(body).toContain("System");
    expect(body).toContain("Light");
    expect(body).toContain("Dark");
  });

  it("can be opened programmatically", () => {
    const { body } = render(ThemeCard, { props: { open: true } });

    expect(body).toContain('aria-expanded="true"');
    expect(body).toContain('data-state="open"');
  });

  it("hides its summary while open", () => {
    const { body } = render(ThemeCard, { props: { open: true } });
    const trigger = /<button[^>]*data-slot="collapsible-trigger".*?<\/button>/s.exec(body)?.[0];

    expect(trigger).toContain("Current preference: System");
    expect(trigger).toContain('aria-hidden="true"');
    expect(trigger).toContain("max-h-0");
    expect(trigger).toContain("opacity-0");
  });

  it("animates mounted content between collapsed and expanded states", () => {
    const collapsed = render(ThemeCard, { props: { open: false } }).body;
    const expanded = render(ThemeCard, { props: { open: true } }).body;
    const collapsedContent = /<div[^>]*data-slot="collapsible-content"[^>]*>/.exec(collapsed)?.[0];
    const expandedContent = /<div[^>]*data-slot="collapsible-content"[^>]*>/.exec(expanded)?.[0];

    expect(collapsedContent).toContain("grid");
    expect(collapsedContent).toContain("grid-rows-[0fr]");
    expect(collapsedContent).toContain("opacity-0");
    expect(collapsedContent).toContain("duration-200");
    expect(collapsedContent).toContain("motion-reduce:transition-none");
    expect(collapsedContent).toContain('aria-hidden="true"');
    expect(collapsedContent).toContain("inert");
    expect(expandedContent).toContain("grid-rows-[1fr]");
    expect(expandedContent).toContain("opacity-100");
    expect(expandedContent).toContain('aria-hidden="false"');
    expect(expandedContent).not.toContain("inert");
  });

  it("uses phrasing content inside its disclosure button", () => {
    const { body } = render(ThemeCard, { props: { open: false } });
    const trigger = /<button[^>]*data-slot="collapsible-trigger".*?<\/button>/s.exec(body)?.[0];

    expect(trigger).toBeDefined();
    expect(trigger).not.toContain("<div");
    expect(trigger).not.toMatch(/<p(?:\s|>)/);
  });

  it("uses compact spacing and small summary text", () => {
    const { body } = render(ThemeCard, { props: { open: false } });
    const card = /<div[^>]*data-slot="card"[^>]*>/.exec(body)?.[0];
    const header = /<div[^>]*data-slot="card-header"[^>]*>/.exec(body)?.[0];
    const trigger = /<button[^>]*data-slot="collapsible-trigger".*?<\/button>/s.exec(body)?.[0];

    expect(card).toContain("gap-0");
    expect(card).toContain("py-0");
    expect(header).toContain("gap-0");
    expect(trigger).toContain("px-4");
    expect(trigger).toContain("py-3");
    expect(trigger).toContain("text-xs");
    expect(trigger).toContain("duration-150");
    expect(trigger).toContain("motion-reduce:transition-none");
  });
});

import { RuleTester } from "eslint";
import svelteParser from "svelte-eslint-parser";
import { describe, it } from "vitest";

import rule from "./no-untokened-classes.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { parser: svelteParser } });

const palette = (className: string) => ({
  data: { className: JSON.stringify(className) },
  messageId: "rawPaletteClass",
});
const fontSize = (className: string) => ({
  data: { className: JSON.stringify(className) },
  messageId: "arbitraryFontSize",
});

describe("no-untokened-classes", () => {
  tester.run("no-untokened-classes", rule, {
    invalid: [
      { code: `<p class="text-[11px]">Text</p>`, errors: [fontSize("text-[11px]")] },
      { code: `<p class="dark:text-red-400">Text</p>`, errors: [palette("dark:text-red-400")] },
      { code: `<p class="bg-red-50/30">Text</p>`, errors: [palette("bg-red-50/30")] },
      {
        code: `<p class="text-sm {danger ? 'text-red-700' : 'text-foreground'}">Text</p>`,
        errors: [palette("text-red-700")],
      },
      {
        code: `<p class={cn("text-green-600", active && "text-[0.7rem]")}>Text</p>`,
        errors: [palette("text-green-600"), fontSize("text-[0.7rem]")],
      },
      {
        code: `<p class={cn({ "text-rose-500": danger })}>Text</p>`,
        errors: [palette("text-rose-500")],
      },
      {
        code: `<p class:text-amber-900={active}>Text</p>`,
        errors: [palette("text-amber-900")],
      },
      {
        code: `<p class="hover:border-amber-200">Text</p>`,
        errors: [palette("hover:border-amber-200")],
      },
    ],
    valid: [
      `<p class="text-2xs bg-destructive/10 text-destructive">Text</p>`,
      `<p class="text-[var(--color-status-warning)] bg-[color-mix(in_srgb,var(--color-paper),var(--color-status-success))]">Text</p>`,
      `<p class={active ? "text-fg-green" : "text-muted-foreground"}>Text</p>`,
      `<p class="text-sm sm:text-base hover:border-border">Text</p>`,
      `<p class:text-destructive={danger}>Text</p>`,
      `<p style="color: red">Text</p>`,
    ],
  });
});

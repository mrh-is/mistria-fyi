import { RuleTester } from "eslint";
import svelteParser from "svelte-eslint-parser";
import { describe, it } from "vitest";

import rule from "./no-hardcoded-ui-text.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { parser: svelteParser } });

const text = (value: string) => ({
  data: { text: JSON.stringify(value) },
  messageId: "hardcodedText",
});
const attribute = (attr: string, value: string) => ({
  data: { attribute: attr, text: JSON.stringify(value) },
  messageId: "hardcodedAttribute",
});

describe("no-hardcoded-ui-text", () => {
  tester.run("no-hardcoded-ui-text", rule, {
    invalid: [
      { code: `<p>Hello there</p>`, errors: [text("Hello there")] },
      {
        code: `<button aria-label="Close">{m.x()}</button>`,
        errors: [attribute("aria-label", "Close")],
      },
      { code: `<img alt="A cat" src={src} />`, errors: [attribute("alt", "A cat")] },
      { code: `<input placeholder="Search" />`, errors: [attribute("placeholder", "Search")] },
      {
        code: `<button aria-label="Remove {name}">{m.x()}</button>`,
        errors: [attribute("aria-label", "Remove")],
      },
      {
        code: `<button title="{count} items left">{m.x()}</button>`,
        errors: [attribute("title", "items left")],
      },
      { code: `<button title={"Close"}>{m.x()}</button>`, errors: [attribute("title", "Close")] },
      {
        code: `<button title={open ? "Collapse" : "Expand"}>{m.x()}</button>`,
        errors: [attribute("title", "Collapse"), attribute("title", "Expand")],
      },
      { code: `<p>{"Hello"}</p>`, errors: [text("Hello")] },
      { code: `<p>{done ? "Yes" : "No"}</p>`, errors: [text("Yes"), text("No")] },
      { code: `<p>{label ?? "None"}</p>`, errors: [text("None")] },
      // oxlint-disable-next-line no-template-curly-in-string -- Svelte source containing a template literal
      { code: "<p>{`Total ${n}`}</p>", errors: [text("Total")] },
      { code: `{#if ok}<span>{"Done"}</span>{/if}`, errors: [text("Done")] },
    ],
    valid: [
      `<p>{m.greeting()}</p>`,
      `<p>{count}</p>`,
      `<p>{"123"}</p>`,
      `<p>  </p>`,
      `<p>42 / 100</p>`,
      `<button aria-label={m.close()}>{m.x()}</button>`,
      `<button aria-label={name}>{m.x()}</button>`,
      `<button aria-label="{a}{b}">{m.x()}</button>`,
      `<button aria-label="">{m.x()}</button>`,
      `<div class="Card" data-label="Hello" id={"Main"}></div>`,
      `<p class={open ? "Open" : "Closed"}>{m.x()}</p>`,
      `<button disabled aria-label={m.close()}>{m.x()}</button>`,
      `<code>npm install</code>`,
      `<kbd>Ctrl</kbd>`,
      `<pre>some code</pre>`,
      `<samp>output</samp>`,
      `<code>{"literal"}</code>`,
      // oxlint-disable-next-line no-template-curly-in-string -- Svelte source containing a template literal
      "<div style:left={`${x}px`}></div>",
      `<script>const label = "Hello";</script><p>{m.x()}</p>`,
      `<style>.a::before { content: "Hello"; }</style>`,
    ],
  });
});

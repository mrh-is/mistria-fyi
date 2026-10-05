import { RuleTester } from "eslint";
import svelteParser from "svelte-eslint-parser";
import { describe, it } from "vitest";

import rule from "./no-raw-internal-href.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { parser: svelteParser } });

const error = (route: string) => ({
  data: { route: JSON.stringify(route) },
  messageId: "rawInternalHref",
});

describe("no-raw-internal-href", () => {
  tester.run("no-raw-internal-href", rule, {
    invalid: [
      { code: `<a href="/about">About</a>`, errors: [error("/about")] },
      { code: `<a href="about">About</a>`, errors: [error("about")] },
      { code: `<a href="./data">Data</a>`, errors: [error("./data")] },
      { code: `<a href="/villagers/{id}">Villager</a>`, errors: [error("/villagers/")] },
      { code: `<a href={"/privacy"}>Privacy</a>`, errors: [error("/privacy")] },
      // oxlint-disable-next-line no-template-curly-in-string -- Svelte source containing a template literal
      { code: "<a href={`/villagers/${id}`}>Villager</a>", errors: [error("/villagers/")] },
      { code: `<a href={open ? "/data" : localizedHref("")}>Data</a>`, errors: [error("/data")] },
      { code: `<a href={target || "/"}>Home</a>`, errors: [error("/")] },
      { code: `<Button href="/data">Data</Button>`, errors: [error("/data")] },
    ],
    valid: [
      `<a href={localizedHref("about")}>About</a>`,
      `<a href={localizedHref("dev/fonts", { locale })}>Fonts</a>`,
      `<a href={resolve("/about")}>About</a>`,
      `<a href={source}>Source</a>`,
      `<a {href}>Link</a>`,
      `<a href={disabled ? undefined : href}>Link</a>`,
      // oxlint-disable-next-line no-template-curly-in-string -- Svelte source containing a template literal
      "<a href={`${base}/about`}>About</a>",
      `<a href="https://www.fieldsofmistria.com/">Fields of Mistria</a>`,
      `<a href="mailto:michael@mistria.fyi">Email</a>`,
      `<a href="//example.com/">Example</a>`,
      `<a href="#main-content">Skip</a>`,
      `<link rel="stylesheet" href="/fonts.css" />`,
      `<a title="/about">Not an href</a>`,
    ],
  });
});

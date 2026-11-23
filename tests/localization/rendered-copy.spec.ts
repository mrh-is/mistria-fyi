import { expect, test } from "../browser/test.js";
import { findUnexpectedLatin } from "./allowed-latin.js";
import { collectRenderedCopy } from "./rendered-copy.js";

test("flags painted copy and the four text attributes", async ({ page }) => {
  await page.setContent(`
    <p>日本語 Mistria Field Guide</p>
    <p>日本語 <span>é</span><strong>à</strong></p>
    <button aria-label="Label leak" title="Tooltip leak">日本語</button>
    <input placeholder="Placeholder leak">
    <img width="16" height="16" alt="Image leak">
    <div hidden title="Hidden leak">Hidden leak</div>
    <div style="visibility: hidden" aria-label="Invisible leak">Invisible leak</div>
    <div style="position: absolute; clip: rect(0, 0, 0, 0)">Visually clipped</div>
    <details><summary>日本語</summary><p title="Collapsed leak">Collapsed leak</p></details>
    <p><code title="Code leak">Verbatim <span>code</span></code></p>
    <kbd>Verbatim key</kbd><pre>Verbatim block</pre><samp>Verbatim sample</samp>
    <p>日本語 A I</p>
    <p>GitHubish</p>
  `);
  const hasUnexpectedLatin = findUnexpectedLatin("/ja");
  const copy = await collectRenderedCopy(page);

  expect(copy.filter(({ text }) => hasUnexpectedLatin(text))).toEqual([
    { source: "p", text: "日本語 éà" },
    { source: "button[aria-label]", text: "Label leak" },
    { source: "button[title]", text: "Tooltip leak" },
    { source: "input[placeholder]", text: "Placeholder leak" },
    { source: "img[alt]", text: "Image leak" },
    { source: "p", text: "GitHubish" },
  ]);
});

test("allows only the exact Data page build identifier", () => {
  const version = "2026.11.23 (deadbeef)";
  const identifier = `Field Guide v${version}`;
  const hasUnexpectedLatin = findUnexpectedLatin("/ja/data", version);

  expect(hasUnexpectedLatin(identifier)).toBe(false);
  expect(hasUnexpectedLatin("Field Guide v2026.11.23 (cafebabe)")).toBe(true);
  expect(hasUnexpectedLatin(`${identifier} latest`)).toBe(true);
  expect(findUnexpectedLatin("/ja", version)(identifier)).toBe(true);
});

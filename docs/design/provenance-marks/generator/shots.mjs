// Renders marks.html's three sheets, light & dark, to PNGs with the workspace Playwright.
// Usage, from the repository root: node docs/design/provenance-marks/generator/shots.mjs
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repo = process.cwd();
const { chromium } = createRequire(path.join(repo, "package.json"))("@playwright/test");
const here = path.join(repo, "docs/design/provenance-marks");
const page = await (
  await chromium.launch()
).newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const sheets = [
  ["sheet-key", "01-key"],
  ["sheet-variants", "02-variants"],
  ["sheet-context", "03-context"],
  ["sheet-quests", "04-quests"],
];
for (const theme of ["light", "dark"]) {
  const url = pathToFileURL(path.join(here, "marks.html"));
  url.search = theme === "dark" ? "?theme=dark" : "";
  await page.goto(url.href);
  await page.evaluate(() => document.fonts.ready);
  for (const [id, name] of sheets) {
    await page
      .locator(`#${id}`)
      .screenshot({ path: path.join(here, "sheets", `${name}-${theme}.png`) });
  }
}
await page.context().browser().close();

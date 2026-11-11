// Renders round-ten.html headless & screenshots its frames, with the workspace Playwright.
// Usage: node docs/design/field-guide/generator/shots.mjs <out-dir> <step>...
// Steps: "c|<selector>" clicks, "shot|<frame selector>|<name>" saves <out-dir>/<name>.png.
// For example: 'c|.ctl [data-v="mid"]' 'c|.ctl [data-v="almanac"]' 'shot|#fd|almanac-mid'
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const page = fileURLToPath(new URL("../round-ten.html", import.meta.url));
const [out, ...steps] = process.argv.slice(2);
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1600, height: 1300 } });
p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await p.goto("file://" + page);
// Draw each frame at its native size: desktop 1440, half screen 960, & phone 390.
await p.addStyleTag({
  content:
    ".wrap { max-width: none !important; } #fd { width: 1440px; } .spread3 { grid-template-columns: 960px 390px !important; }",
});
await p.waitForTimeout(1500);
for (const step of steps) {
  const [kind, selector, name] = step.split("|");
  if (kind === "c") await p.locator(selector).first().click();
  if (kind === "shot") {
    await p.waitForTimeout(300);
    await p.locator(selector).screenshot({ path: `${out}/${name}.png` });
  }
}
await browser.close();

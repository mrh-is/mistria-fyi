// Renders each canvas row to one PNG: PC boards cropped to the 512 px column, phones whole.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const [, , canvasRoot, outDir, repo] = process.argv;
const { chromium } = createRequire(path.join(repo, "package.json"))("@playwright/test");
const canvas = JSON.parse(fs.readFileSync(path.join(canvasRoot, "project/canvas.json"), "utf8"));
const rows = Object.entries(canvas.notes)
  .filter(([k, n]) => n.kind === "title1")
  .map(([k, n]) => ({ id: k.slice(2), title: n.text, y: n.y }));
const qrCells = () => {
  let n = 21,
    out = "",
    seed = 7;
  const finder = (r, c) => {
    for (const [a, b] of [
      [0, 0],
      [0, n - 7],
      [n - 7, 0],
    ]) {
      const dr = r - a,
        dc = c - b;
      if (dr >= 0 && dr < 7 && dc >= 0 && dc < 7)
        return Math.min(dr, dc, 6 - dr, 6 - dc) === 1 ? 0 : 1;
      if (dr >= -1 && dr <= 7 && dc >= -1 && dc <= 7) return 0;
    }
    return -1;
  };
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const f = finder(r, c);
      seed = (seed * 9301 + 49297) % 233280;
      out += `<div style="background:${(f === -1 ? seed / 233280 > 0.52 : f === 1) ? "#2e2a22" : "transparent"}"></div>`;
    }
  return out;
};
const body = (file) =>
  fs
    .readFileSync(path.join(canvasRoot, "project", file), "utf8")
    .match(/<x-dc>([\s\S]*)<\/x-dc>/)[1]
    .replace(/<helmet>[\s\S]*?<\/helmet>/, "")
    .replace(/<sc-for[\s\S]*?<\/sc-for>/g, qrCells());
const fonts = fs
  .readFileSync(path.join(canvasRoot, "project/Main.dc.html"), "utf8")
  .match(/<link rel="stylesheet"[^>]*>/)[0];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2600, height: 1000 } });
fs.mkdirSync(outDir, { recursive: true });
let i = 0;
for (const r of rows) {
  i++;
  const files = canvas.order.filter((f) => {
    const b = canvas.boards[f];
    const next = rows.find((x) => x.y > r.y);
    return b.y >= r.y && (!next || b.y < next.y);
  });
  const cells = files
    .map((f) => {
      const b = canvas.boards[f];
      const pc = b.w > 1000;
      const w = pc ? 600 : b.w;
      return `<figure style="margin:0;display:flex;flex-direction:column;gap:8px"><figcaption style="font:600 15px/1.3 Georgia,serif;color:#2e2a22;max-width:${w}px">${b.title}</figcaption><div style="width:${w}px;height:${b.h}px;overflow:hidden;border:1px solid #948a7c;position:relative"><div style="position:absolute;left:${pc ? -(b.w - w) / 2 : 0}px;top:0">${body(f)}</div></div></figure>`;
    })
    .join("");
  await page.setContent(
    `<!doctype html><meta charset="utf-8">${fonts}<body style="margin:0;background:#e9e5dc"><main id="m" style="display:flex;flex-wrap:wrap;gap:40px 32px;padding:32px;width:fit-content;max-width:2540px">${cells}</main></body>`,
    { waitUntil: "networkidle" },
  );
  await page.evaluate(() => document.fonts.ready);
  // Trim empty paper under pages with no toolbar or dialog, so the sheet stays compact.
  await page.evaluate(() => {
    for (const frame of document.querySelectorAll("figure > div")) {
      if (
        frame.querySelector('[role="dialog"]') ||
        [...frame.querySelectorAll("div")].some((d) => d.style.bottom === "12px")
      )
        continue;
      const top = frame.getBoundingClientRect().top;
      let max = 0;
      for (const el of frame.querySelectorAll("header, section, p, div, button, ol, ul")) {
        const r = el.getBoundingClientRect();
        if (r.height && r.height < frame.clientHeight - 2) max = Math.max(max, r.bottom - top);
      }
      frame.style.height = Math.min(frame.clientHeight, Math.ceil(max + 32)) + "px";
    }
  });
  const name = `${String(i).padStart(2, "0")}-${r.id.replace(/_/g, "-")}.png`;
  await page.locator("#m").screenshot({ path: path.join(outDir, name) });
  console.log(name, files.length);
}
await browser.close();

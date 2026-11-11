// Bakes every sprite the mockup draws three ways: full color, a lighter tint of its category's color (To do),
// & a flat silhouette (Not now). Baking replaces round nine's SVG filter on every sprite.
// Usage: node docs/design/field-guide/generator/bake.mjs [<data.json>]
// It fetches each sprite from the production asset host and writes the gitignored sprites.js beside
// round-ten.html. Without a data file, it reads the data already in round-ten.html.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const [dataPath] = process.argv.slice(2);
const outPath = fileURLToPath(new URL("../sprites.js", import.meta.url));
const pageData = () => {
  const html = readFileSync(fileURLToPath(new URL("../round-ten.html", import.meta.url)), "utf8");
  const line = html.match(/^const DATA = (.*);$/m);
  if (!line) throw new Error('round-ten.html has no "const DATA = …;" line');
  return line[1];
};
const r = JSON.parse(dataPath ? readFileSync(dataPath, "utf8") : pageData());
const ORIGIN = "https://assets.mistria.fyi/sprites";
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const PAPER = hex("#f7f5f0"),
  INK = hex("#2e2a22"),
  SIL = hex("#948a7c");
const COLORS = {
  almanac: "#5848c0",
  museum: "#2e8a30",
  recipes: "#b87028",
  villagers: "#c03060",
  ink: "#2e2a22",
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
// Three stops, dark → mid → light, mapped from each pixel's luminance.
const stops = (c) => {
  const col = hex(c);
  return [mix(col, INK, 0.45), mix(col, PAPER, 0.28), mix(col, PAPER, 0.9)];
};

async function variants(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const webp = async (px) =>
    (await sharp(px, { raw: info }).webp({ lossless: true }).toBuffer()).toString("base64");
  const out = { c: (await sharp(buf).webp({ lossless: true }).toBuffer()).toString("base64") };
  for (const [k, c] of Object.entries(COLORS)) {
    const [a, m, l] = stops(c),
      px = Buffer.from(data);
    for (let i = 0; i < px.length; i += 4) {
      const y = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      const [p, q, t] = y < 0.5 ? [a, m, y * 2] : [m, l, (y - 0.5) * 2];
      for (let j = 0; j < 3; j++) px[i + j] = Math.round(p[j] * (1 - t) + q[j] * t);
    }
    out[k] = await webp(px);
  }
  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) [px[i], px[i + 1], px[i + 2]] = SIL;
  out.s = await webp(px);
  return out;
}
const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
};
const need = new Map();
for (const e of r.E)
  if (e[4]) {
    const s = need.get(e[4]) ?? new Set();
    s.add(e[0]);
    need.set(e[4], s);
  }
const items = {};
for (const [id, cats] of need) {
  const v = await variants(await get(`${ORIGIN}/items/${id}.webp?g=2`));
  items[id] = {
    c: v.c,
    s: v.s,
    ink: v.ink,
    ...Object.fromEntries([...cats].filter((c) => COLORS[c]).map((c) => [c, v[c]])),
  };
}
const vill = {};
for (const v of r.vill) {
  const x = await variants(await get(`${ORIGIN}/villagers/${v.id}.webp?g=2`));
  vill[v.id] = { c: x.c, villagers: x.villagers, s: x.s };
}
writeFileSync(outPath, `window.SPRS = ${JSON.stringify({ items, vill })};\n`);
console.log("baked", Object.keys(items).length, "items &", Object.keys(vill).length, "villagers");

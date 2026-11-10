// Swaps fresh data into round-ten.html, which keeps it on one line. Sprites live in the gitignored
// sprites.js, which bake.mjs writes.
// Usage: node docs/design/field-guide/generator/inject.mjs <data.json>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const page = fileURLToPath(new URL("../round-ten.html", import.meta.url));
const [path] = process.argv.slice(2);
if (!path) throw new Error("Usage: inject.mjs <data.json>");
let html = readFileSync(page, "utf8");
const json = JSON.stringify(JSON.parse(readFileSync(path, "utf8")));
const line = /^const DATA = .*;$/m;
if (!line.test(html)) throw new Error('round-ten.html has no "const DATA = …;" line');
html = html.replace(line, () => `const DATA = ${json};`);
writeFileSync(page, html);
console.log("updated", page);

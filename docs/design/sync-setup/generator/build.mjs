import fs from "node:fs";
import path from "node:path";

import { rows, notes } from "./boards.mjs";
import * as k from "./kit.mjs";

const root = process.argv[2];
const prev = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const out = path.join(root, "project");
fs.mkdirSync(out, { recursive: true });

const QR = `var n = 21, cells = [], seed = 7;
    function finder(r, c) {
      var spots = [[0, 0], [0, n - 7], [n - 7, 0]];
      for (var i = 0; i < spots.length; i++) {
        var dr = r - spots[i][0], dc = c - spots[i][1];
        if (dr >= 0 && dr < 7 && dc >= 0 && dc < 7) { var ring = Math.min(dr, dc, 6 - dr, 6 - dc); return ring === 1 ? 0 : 1; }
        if (dr >= -1 && dr <= 7 && dc >= -1 && dc <= 7) return 0;
      }
      return -1;
    }
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      var f = finder(r, c);
      seed = (seed * 9301 + 49297) % 233280;
      cells.push({ fill: (f === -1 ? seed / 233280 > 0.52 : f === 1) ? '#2e2a22' : 'transparent' });
    }
    return { cells: cells };`;

const VOID = new Set(["meta", "link", "br", "img", "input", "hr"]);
function balanced(html, file) {
  const stack = [];
  const re = /<\/?([a-zA-Z][\w-]*)[^>]*?>/g;
  // Not a sanitizer: scripts are dropped so their markup doesn't count toward the tag balance.
  let body = html;
  for (let prev = ""; prev !== body;) {
    prev = body;
    body = body.replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, "");
  }
  for (const m of body.matchAll(re)) {
    const tag = m[1].toLowerCase();
    if (VOID.has(tag) || m[0].startsWith("<!")) continue;
    if (m[0].startsWith("</")) {
      const top = stack.pop();
      if (top !== tag) throw new Error(`${file}: expected </${top}>, got </${tag}>`);
    } else if (!m[0].endsWith("/>")) stack.push(tag);
  }
  if (stack.length) throw new Error(`${file}: unclosed ${stack.join(",")}`);
}

const boards = {};
const order = [];
const nts = {};
let y = 0;
const written = [];
for (const r of rows) {
  const maxH = Math.max(...r.boards.map((bd) => bd.h));
  let x = 0;
  for (const bd of r.boards) {
    k.setPalette(bd.dark ? k.DARK : k.LIGHT);
    const C = k.C;
    const html = bd.render();
    const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${bd.title.replace(/·/g, "-")}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
${k.FONTS}
<style>
body{margin:0;background:${C.paper}}
a{color:${C.blue}}a:hover{color:${C.ink}}
</style>
</helmet>
${html}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${bd.w},"height":${bd.h}}}'>
class Component extends DCLogic {
  renderVals() {
    ${bd.qr ? QR : "return {};"}
  }
}
</script>
</body>
</html>
`;
    balanced(page, bd.file);
    if (page.includes("'") && /data-props='[^']*'[^>]*'/.test(page))
      throw new Error(bd.file + ": quote in data-props");
    fs.writeFileSync(path.join(out, bd.file), page);
    written.push(bd.file);
    boards[bd.file] = { x, y, w: bd.w, h: bd.h, title: bd.title };
    order.push(bd.file);
    x += bd.w + 80;
  }
  nts[`t_${r.id}`] = { x: 0, y: y - 260, text: r.title, kind: "title1", maxW: x - 80 };
  let ny = y;
  for (const [id, n] of Object.entries(notes))
    if (n.row === r.id) {
      nts[id] = { x: x, y: ny, w: 320, text: n.text, fill: n.fill };
      ny += 300;
    }
  y += maxH + 120 + 260;
}

const canvas = { ...prev, title: "Sync setup", boards, order, notes: nts };
fs.writeFileSync(path.join(out, "canvas.json"), JSON.stringify(canvas, null, 2) + "\n");
const removed = Object.keys(prev.boards).filter((f) => !boards[f]);
fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify({ written, removed }, null, 2));
console.log(`${written.length} boards, removed ${removed.length}: ${removed.join(", ")}`);

import { describe, expect, it } from "vitest";

import { ALLOWED_FONT_FILES, findVendoredAssets } from "./check-vendored-assets.js";

const check = (files: Record<string, string>) =>
  findVendoredAssets(Object.keys(files), (file) => {
    const text = files[file];
    if (text === undefined) {
      throw new Error(`ENOENT: ${file}`);
    }
    return text;
  });

// Base64 bodies of the right shape; the bytes after each magic number are filler. Data URIs are
// assembled at runtime so this file doesn't trip the check it tests.
const body = (magic: string, length: number) => magic + "Ab0+".repeat(Math.ceil(length / 4));
const dataUri = (type: string) => ["data", `${type};base64,`].join(":");
const wrap = (text: string) => (text.match(/.{1,76}/g) ?? []).join("\n");

describe("vendored asset check", () => {
  it("allows the open-licensed app fonts & rejects any other font file", () => {
    const [allowed] = ALLOWED_FONT_FILES;
    expect(check({ [allowed]: "" })).toEqual([]);
    expect(check({ "static/fonts/satoshi-regular.woff2": "" })).toEqual([
      expect.objectContaining({ file: "static/fonts/satoshi-regular.woff2" }),
    ]);
    expect(check({ "docs/design/Satoshi.OTF": "", "fonts/game.ttc": "" })).toHaveLength(2);
  });

  it("skips a font file that the working tree has deleted", () => {
    expect(
      findVendoredAssets(["static/fonts/satoshi-regular.woff2"], () => {
        throw new Error("ENOENT");
      }),
    ).toEqual([]);
  });

  it("rejects a font inlined as a data URI, once per line", () => {
    const css = `@font-face { src: url(${dataUri("font/woff2")}${body("d09GMk9UVE8", 200)}); }`;
    expect(check({ "mockup.html": `<style>\n${css}\n</style>` })).toEqual([
      expect.objectContaining({
        file: "mockup.html",
        line: 2,
        problem: expect.stringMatching(/font/),
      }),
    ]);
    expect(
      check({ "a.css": `src: url(${dataUri("application/vnd.ms-fontobject")}AAAA)` }),
    ).toHaveLength(1);
  });

  it.each([
    ["WOFF2", "d09GMg"],
    ["WOFF", "d09GRg"],
    ["CFF OpenType", "T1RUTw"],
    ["TrueType", "AAEAAA"],
    ["Apple TrueType", "dHJ1ZQ"],
    ["font collection", "dHRjZg"],
  ])("rejects a raw base64 %s body", (_, magic) => {
    expect(check({ "fonts.json": JSON.stringify({ font: body(magic, 200) }) })).toHaveLength(1);
  });

  it("rejects long base64 sprites without a data: prefix", () => {
    const sprites = `const SPRS = ${JSON.stringify({ a: { c: body("UklGRoAAAABXRUJQ", 400) } })};`;
    expect(check({ "round-ten.html": sprites })).toEqual([
      expect.objectContaining({ line: 1, problem: expect.stringMatching(/image/) }),
    ]);
  });

  it("rejects line-wrapped & URL-safe base64 images", () => {
    expect(check({ "wrapped.txt": `header\n${wrap(body("iVBORw0KGgo", 3000))}\n` })).toEqual([
      expect.objectContaining({ line: 2 }),
    ]);
    expect(check({ "url-safe.json": `"${body("_9j_", 400).replaceAll("+", "-")}"` })).toHaveLength(
      1,
    );
  });

  it("allows small inline images, SVG, & long non-image strings", () => {
    expect(
      check({
        "a.css": `a { background: url(${dataUri("image/png")}${body("iVBORw0KGgo", 40)}); }`,
        "data.html": `const DATA = "${"01".repeat(5000)}";`,
        "icon.svg": "<svg><path d='M0 0h24v24H0z'/></svg>",
        "sprite.webp": "binary",
      }),
    ).toEqual([]);
  });
});

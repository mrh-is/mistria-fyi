import "#scripts/lib/require-pinned-node";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Keeps licensed fonts & game art out of Git, which the public repository would redistribute.
 * `docs/font-assets.md` & `docs/sprite-assets.md` say where each lives instead. The check fails on:
 *
 * - a font file that isn't one of the open-licensed fonts the app ships,
 * - a font inlined into a text file, as a `data:` URI or a base64 WOFF, WOFF2, or OpenType body,
 * - an image inlined into a text file as a long base64 WebP, PNG, JPEG, or GIF body.
 *
 * Small inline images & SVG stay legal: the image patterns need a long base64 body, and SVG is text.
 */

/** Open-licensed fonts the app serves itself; see `THIRD-PARTY-NOTICES.md`. */
export const ALLOWED_FONT_FILES = new Set([
  "static/fonts/fragment-mono-regular.woff2",
  "static/fonts/ibm-plex-mono-latin.woff2",
  "static/fonts/instrument-serif-italic.woff2",
  "static/fonts/petrona-italic-latin.woff2",
  "static/fonts/petrona-latin.woff2",
]);

const FONT_FILE = /\.(?:woff2?|ttf|otf|eot|ttc|otc|dfont)$/i;
const BINARY_FILE =
  /\.(?:png|webp|jpe?g|gif|ico|avif|woff2?|ttf|otf|eot|ttc|otc|dfont|zip|sav|pdf|wasm)$/i;
/**
 * One base64 character, standard or URL-safe, optionally followed by a line break & indentation,
 * so wrapped base64 (76 columns from `base64` & Python) still forms one run.
 */
const B64 = String.raw`[A-Za-z0-9+/_-](?:\r?\n[ \t]*)?`;
/**
 * `data:` font URIs (including EOT's MIME type), and the base64 magic of WOFF2 (`wOF2`), WOFF
 * (`wOFF`), CFF OpenType (`OTTO`), TrueType (`00 01 00 00`), Apple TrueType (`true`), & font
 * collections (`ttcf`).
 */
const INLINE_FONT = new RegExp(
  String.raw`data:(?:font/|application/(?:x-)?font|application/vnd\.ms-fontobject)|(?:d09GMg|d09GRg|T1RUTw|AAEAAA|dHJ1ZQ|dHRjZg)(?:${B64}){100,}`,
  "g",
);
/** The base64 magic of WebP (`RIFF`), PNG, JPEG, & GIF, followed by a body over about 150 bytes. */
const INLINE_IMAGE = new RegExp(
  String.raw`(?:UklGR|iVBORw0KGgo|/9j/|_9j_|R0lGOD)(?:${B64}){200,}`,
  "g",
);

/** Each 1-based line where a global pattern's match starts, once per line. */
const matchLines = (text: string, pattern: RegExp) => [
  ...new Set(
    [...text.matchAll(pattern)].map(({ index }) => text.slice(0, index).split("\n").length),
  ),
];

export interface Finding {
  file: string;
  line?: number;
  problem: string;
}

/** Every vendored font or inlined font & image in the named tracked files. */
export function findVendoredAssets(
  files: string[],
  read: (file: string) => string = (file) => readFileSync(file, "utf8"),
): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    const posix = file.replaceAll("\\", "/");
    const fontFile = FONT_FILE.test(posix);
    if (!fontFile && BINARY_FILE.test(posix)) {
      continue;
    }
    let text: string;
    try {
      text = read(file);
    } catch {
      // A tracked file can be deleted in the working tree; there is nothing to check.
      continue;
    }
    if (fontFile) {
      if (!ALLOWED_FONT_FILES.has(posix)) {
        findings.push({
          file: posix,
          problem: "font file outside the open-licensed set; see docs/font-assets.md",
        });
      }
      continue;
    }
    for (const line of matchLines(text, INLINE_FONT)) {
      findings.push({
        file: posix,
        line,
        problem: "inlined font; load it from assets.mistria.fyi (docs/font-assets.md)",
      });
    }
    for (const line of matchLines(text, INLINE_IMAGE)) {
      findings.push({
        file: posix,
        line,
        problem:
          "inlined base64 image; game art lives on assets.mistria.fyi (docs/sprite-assets.md)",
      });
    }
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const files =
    args.length > 0
      ? args
      : execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const findings = findVendoredAssets(files);
  for (const { file, line, problem } of findings) {
    console.error(`${file}${line === undefined ? "" : `:${line}`}: ${problem}`);
  }
  if (findings.length > 0) {
    console.error(
      `\n${findings.length} vendored asset(s). The public repository would redistribute them.`,
    );
    process.exitCode = 1;
  }
}

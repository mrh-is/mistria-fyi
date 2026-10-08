import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gzipSync } from "node:zlib";

import { builtLocaleChunks } from "../../scripts/built-locale-chunks.js";

void test("keeps each locale’s name data within the byte budget", (context) => {
  const sizes = Object.entries(builtLocaleChunks()).map(([locale, paths]) => {
    assert.ok(paths.length > 0, `${locale} name chunks inlined into the service worker`);
    return {
      gzip: paths.reduce(
        (total, path) => total + gzipSync(readFileSync(`.svelte-kit/output/client${path}`)).length,
        0,
      ),
      locale,
    };
  });
  const total = sizes.reduce((sum, { gzip }) => sum + gzip, 0);
  context.diagnostic(
    `${sizes.map(({ gzip, locale }) => `${locale} ${String(gzip)}`).join(", ")}; all ${String(total)} (none precached)`,
  );
  for (const { gzip, locale } of sizes) {
    assert.ok(gzip <= 100_000, `${locale}: ${String(gzip)} gzip bytes exceeds 100 KB`);
  }
});

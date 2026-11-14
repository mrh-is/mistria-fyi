import { afterEach, expect, it } from "vitest";

import { overwriteGetLocale } from "./locale-runtime.js";
import { loadSharedUi, readSharedRuntime } from "./shared-ui.js";

afterEach(() => {
  overwriteGetLocale();
});

it("keeps the active runtime when another locale is preloaded", async () => {
  overwriteGetLocale(() => "es");
  await loadSharedUi("es");
  const spanish = readSharedRuntime();

  await loadSharedUi("zh-Hant");
  expect(readSharedRuntime()).toBe(spanish);

  overwriteGetLocale(() => "zh-Hant");
  expect(readSharedRuntime().l).toBe("zh-Hant");
  expect(spanish.l).toBe("es");
});

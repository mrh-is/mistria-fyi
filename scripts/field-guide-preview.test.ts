import { describe, expect, it } from "vitest";

import { previewUrl } from "./field-guide-preview.js";

describe("field guide preview URL", () => {
  it.each([
    "http://localhost:5173/en/museum",
    "http://127.0.0.1:5173/en/museum",
    "http://[::1]:5173/en/museum",
    "https://next.mistria.fyi/en/museum",
    "https://codex-676-preview-progress.mistria-fyi.pages.dev/en/museum",
  ])("accepts %s", (url) => {
    expect(previewUrl(url).href).toBe(url);
  });

  it.each([
    "https://mistria.fyi/en/museum",
    "https://mistria-fyi.pages.dev/en/museum",
    "https://mistria-fyi.pages.dev.example.com/",
    "https://preview.mistria-fyi.pages.dev.example.com/",
    "http://next.mistria.fyi/",
    "https://user:password@next.mistria.fyi/",
  ])("rejects %s", (url) => {
    expect(() => previewUrl(url)).toThrow("Use a local dev URL or a Mistria branch preview URL.");
  });
});

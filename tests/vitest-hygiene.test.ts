import { afterAll, beforeAll, expect, it, vi } from "vitest";

const reporter = { error: () => undefined };
const originalError = reporter.error;
const originalGlobal = Object.getOwnPropertyDescriptor(globalThis, "__vitestHygieneProbe");

// Seed in beforeAll so this checks Vitest's automatic cleanup before each test,
// independent of file order or worker scheduling.
beforeAll(() => {
  vi.spyOn(reporter, "error").mockImplementation(() => undefined);
  vi.stubGlobal("__vitestHygieneProbe", "leaked stub");
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("restores spies before a test runs", () => {
  expect(reporter.error).toBe(originalError);
});

it("restores global stubs before a test runs", () => {
  expect(Object.getOwnPropertyDescriptor(globalThis, "__vitestHygieneProbe")).toEqual(
    originalGlobal,
  );
});

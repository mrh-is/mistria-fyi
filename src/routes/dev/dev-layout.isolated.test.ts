import { isHttpError } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({ dev: false }));

vi.mock("$app/env", () => environment);

const { load } = await import("./+layout.js");

function run(): unknown {
  return load({} as never);
}

describe("dev tooling layout", () => {
  it("404s in production builds", () => {
    environment.dev = false;
    let thrown: unknown;
    try {
      run();
    } catch (error) {
      thrown = error;
    }
    expect(isHttpError(thrown, 404)).toBe(true);
  });

  it("renders during development", () => {
    environment.dev = true;
    expect(() => run()).not.toThrow();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({ browser: false }));
const runtime = vi.hoisted(() => ({
  getLocale: vi.fn(() => "ja"),
  getLocaleForUrl: vi.fn(() => "ru"),
}));

vi.mock("$app/environment", () => environment);
vi.mock("$lib/paraglide/runtime.js", () => runtime);

const { load } = await import("./+layout.js");

function run(): { locale: string } {
  return load({ url: new URL("https://mistria.fyi/ru") } as never) as { locale: string };
}

describe("root layout locale", () => {
  beforeEach(() => {
    runtime.getLocale.mockClear();
    runtime.getLocaleForUrl.mockClear();
  });

  it("reads the middleware-resolved locale during SSR", () => {
    environment.browser = false;
    expect(run().locale).toBe("ja");
    expect(runtime.getLocaleForUrl).not.toHaveBeenCalled();
  });

  it("resolves the locale from the target URL in the browser", () => {
    environment.browser = true;
    expect(run().locale).toBe("ru");
    expect(runtime.getLocale).not.toHaveBeenCalled();
  });
});

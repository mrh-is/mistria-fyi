import { beforeEach, describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({ browser: false }));
const runtime = vi.hoisted(() => ({
  getLocale: vi.fn(() => "ja"),
  getLocaleForUrl: vi.fn(() => "ru"),
}));

const names = vi.hoisted(() => ({ loadNames: vi.fn(() => Promise.resolve()) }));

vi.mock("$app/env", () => environment);
vi.mock("#lib/paraglide/runtime.js", () => runtime);
vi.mock("#lib/data/names.js", () => names);

const { load } = await import("./+layout.js");

async function run(): Promise<{ locale: string }> {
  return (await load({ url: new URL("https://mistria.fyi/ru") } as never)) as { locale: string };
}

describe("root layout locale", () => {
  beforeEach(() => {
    runtime.getLocale.mockClear();
    runtime.getLocaleForUrl.mockClear();
  });

  it("reads the middleware-resolved locale during SSR", async () => {
    environment.browser = false;
    expect((await run()).locale).toBe("ja");
    expect(runtime.getLocaleForUrl).not.toHaveBeenCalled();
    expect(names.loadNames).toHaveBeenCalledWith("ja", ["ui"]);
  });

  it("resolves the locale from the target URL in the browser", async () => {
    environment.browser = true;
    expect((await run()).locale).toBe("ru");
    expect(runtime.getLocale).not.toHaveBeenCalled();
  });
});

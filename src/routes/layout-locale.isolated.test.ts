import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  getLocale: vi.fn(() => "ja"),
}));

const names = vi.hoisted(() => ({ loadNames: vi.fn(() => Promise.resolve()) }));

vi.mock("#lib/i18n/locale-runtime.js", () => runtime);
vi.mock("#lib/data/names.js", () => names);

const { load } = await import("./+layout.js");

async function run(pathname: string, routeId: null | string): Promise<{ locale: string }> {
  return (await load({
    route: { id: routeId },
    url: new URL(pathname, "https://mistria.fyi"),
  } as never)) as {
    locale: string;
  };
}

describe("root layout locale", () => {
  beforeEach(() => {
    runtime.getLocale.mockClear();
  });

  it("uses the request locale for unprefixed errors", async () => {
    const data = await run("/unknown", null);
    expect(data.locale).toBe("ja");
    expect(names.loadNames).toHaveBeenCalledWith("ja", ["ui"]);
  });

  it("resolves the target URL independently of the active locale", async () => {
    const data = await run("/ru", "/");
    expect(data.locale).toBe("ru");
    expect(runtime.getLocale).not.toHaveBeenCalled();
  });
});

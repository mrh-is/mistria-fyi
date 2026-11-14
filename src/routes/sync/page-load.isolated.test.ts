import { describe, expect, it, vi } from "vitest";

async function runLoad(): Promise<unknown> {
  vi.resetModules();
  const { load } = await import("./+page.js");
  const event = {
    parent: () => Promise.resolve({ locale: "en" as const }),
    url: new URL("https://mistria.fyi/en/sync"),
  };
  return (load as unknown as (event: unknown) => Promise<unknown>)(event);
}

describe("the sync page", () => {
  it("loads its metadata", async () => {
    const result = (await runLoad()) as { metadata: { title: string } };
    expect(result.metadata.title).toContain("Sync your save file");
  });
});

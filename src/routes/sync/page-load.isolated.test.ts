import { describe, expect, it, vi } from "vitest";

const enabled = vi.hoisted(() => ({ syncEnabled: true }));
vi.mock("#lib/sync/enabled.js", () => enabled);

async function runLoad(): Promise<unknown> {
  vi.resetModules();
  const { load } = await import("./+page.js");
  const event = { parent: () => Promise.resolve({ locale: "en" as const }) };
  return (load as unknown as (event: unknown) => Promise<unknown>)(event);
}

describe("the sync page", () => {
  it("loads where sync is on", async () => {
    enabled.syncEnabled = true;
    const result = (await runLoad()) as { metadata: { title: string } };
    expect(result.metadata.title).toContain("Sync your save file");
  });

  it("sends players Home on the production site until launch", async () => {
    enabled.syncEnabled = false;
    await expect(runLoad()).rejects.toMatchObject({ status: 307 });
  });
});

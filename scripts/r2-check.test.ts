import { afterEach, describe, expect, it, vi } from "vitest";

import { checkR2Upload } from "#scripts/r2-check";

import type { WranglerResult } from "#scripts/lib/r2-upload";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function quiet() {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  return vi.spyOn(console, "error").mockImplementation(() => undefined);
}

describe("checkR2Upload", () => {
  it("puts then deletes one probe object in the bucket", async () => {
    vi.stubEnv("R2_UPLOAD_TOKEN", "r2-admin");
    vi.stubEnv("R2_BUCKET", "staging");
    quiet();
    const calls: string[][] = [];
    const run = (args: string[]): Promise<WranglerResult> => {
      calls.push(args);
      return Promise.resolve({ ok: true, output: "" });
    };

    await expect(checkR2Upload(run)).resolves.toBe(0);

    expect(calls.map((args) => args.slice(0, 3))).toEqual([
      ["r2", "object", "put"],
      ["r2", "object", "delete"],
    ]);
    expect(calls[0]?.[3]).toMatch(/^staging\/tmp\/r2-check-.+\.txt$/);
    expect(calls[1]?.[3]).toBe(calls[0]?.[3]);
  });

  it("fails without a token & never runs Wrangler", async () => {
    vi.stubEnv("R2_UPLOAD_TOKEN", "");
    const errors = quiet();
    const run = vi.fn<(args: string[]) => Promise<WranglerResult>>();

    await expect(checkR2Upload(run)).resolves.toBe(1);

    expect(run).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("R2_UPLOAD_TOKEN is not set"));
  });

  it("fails, skipping the delete, when the put fails", async () => {
    vi.stubEnv("R2_UPLOAD_TOKEN", "r2-admin");
    quiet();
    const run = vi.fn((_args: string[]) =>
      Promise.resolve<WranglerResult>({ ok: false, output: "Authentication error" }),
    );

    await expect(checkR2Upload(run)).resolves.toBe(1);

    expect(run).toHaveBeenCalledTimes(1);
  });
});

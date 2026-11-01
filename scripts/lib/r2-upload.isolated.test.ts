// Mocks `node:child_process`, so it runs in an isolated project (tests/vitest-isolation.test.ts).
import { ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runWrangler } from "#scripts/lib/r2-upload";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock(import("node:child_process"), async (importOriginal) => ({
  ...(await importOriginal()),
  spawn: spawnMock,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  spawnMock.mockReset();
});

describe("runWrangler", () => {
  it("spawns Wrangler with the upload token as its CLOUDFLARE_API_TOKEN", async () => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "pages-read");
    vi.stubEnv("R2_UPLOAD_TOKEN", "r2-admin");
    spawnMock.mockImplementation(() => {
      const child = Object.assign(new ChildProcess(), {
        stderr: new PassThrough(),
        stdout: new PassThrough(),
      });
      queueMicrotask(() => child.emit("close", 0));
      return child;
    });

    await expect(runWrangler(["r2", "bucket", "list"])).resolves.toEqual({
      ok: true,
      output: "",
    });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const spawnOptions = (spawnMock.mock.calls[0] as [string, string[], { env: object }])[2];
    expect(spawnOptions.env).toMatchObject({ CLOUDFLARE_API_TOKEN: "r2-admin" });
  });
});

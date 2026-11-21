import { describe, expect, it, vi } from "vitest";

import { loadOpSecrets } from "./op-agent.js";

describe("loadOpSecrets", () => {
  it("fills unset names and leaves existing values intact", async () => {
    const read = vi.fn<(reference: string) => Promise<string>>((reference) =>
      Promise.resolve(reference === "op://Agent secrets/Item/token" ? "from-vault" : "other"),
    );
    const env: NodeJS.ProcessEnv = { EXISTING: "from-shell" };

    await loadOpSecrets(
      {
        EXISTING: "op://Agent secrets/Item/existing",
        UNSET: "op://Agent secrets/Item/token",
      },
      env,
      read,
    );

    expect(env).toEqual({ EXISTING: "from-shell", UNSET: "from-vault" });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not resolve references for names that are already set", async () => {
    const read = vi.fn<(reference: string) => Promise<string>>();

    await loadOpSecrets(
      { R2_UPLOAD_TOKEN: "op://Agent secrets/Item/token" },
      { R2_UPLOAD_TOKEN: "from-shell" },
      read,
    );

    expect(read).not.toHaveBeenCalled();
  });
});

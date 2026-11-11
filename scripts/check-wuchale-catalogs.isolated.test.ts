import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { getConfig, Hub } from "wuchale";

import { checkCatalogs } from "./check-wuchale-catalogs.js";

import type { Config } from "wuchale";

it("extracts a new UI message helper during development without registration", async () => {
  // Wuchale imports its configuration once per process, so load it in an isolated test project.
  vi.stubEnv("NODE_ENV", "development");
  const root = await mkdtemp(join(tmpdir(), "mistria-catalogs-"));
  try {
    const base = await getConfig(fileURLToPath(new URL("../wuchale.config.js", import.meta.url)));
    const config: Config = {
      ...base,
      adapters: { "shared-script": base.adapters["shared-script"] },
      ai: null,
      locales: ["en", "es"],
    };
    const sourceDirectory = join(root, "src/routes/data");
    const catalogs = join(root, config.localesDir);
    await mkdir(sourceDirectory, { recursive: true });
    await mkdir(catalogs, { recursive: true });
    await writeFile(join(catalogs, "shared-script.loader.js"), "export {};\n");

    const hub = await Hub.create("dev", config, root);
    const source = join(sourceDirectory, "backup-messages.ts");
    const code = 'export function label() { return "Download a backup"; }\n';
    await writeFile(source, code);
    const result = await hub.transform(code, source);

    expect(result.code).toContain("shared-script.loader.js");
    expect(await readFile(join(catalogs, "shared.json"), "utf8")).toContain("Download a backup");
    expect(await checkCatalogs(config, root)).toContain(
      "Missing or incomplete es translation: Download a backup",
    );
  } finally {
    vi.unstubAllEnvs();
    await rm(root, { force: true, recursive: true });
  }
});

it("discovers new components and requires translations again when their English changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "mistria-catalogs-"));
  try {
    const base = await getConfig(fileURLToPath(new URL("../wuchale.config.js", import.meta.url)));
    const config: Config = {
      ...base,
      adapters: { shared: base.adapters.shared },
      ai: null,
      locales: ["en", "es"],
    };
    const components = join(root, "src/lib/components");
    const catalog = join(root, config.localesDir, "shared.json");
    const source = join(components, "new-feature.svelte");
    await mkdir(components, { recursive: true });
    await mkdir(join(root, config.localesDir), { recursive: true });
    await writeFile(join(root, config.localesDir, "shared.loader.js"), "export {};\n");
    await writeFile(source, "<button>Open your notebook</button>\n");

    const extract = async () => {
      const hub = await Hub.create("cli", config, root);
      await hub.directVisit(true, false, false);
    };
    await extract();
    const initial = await readFile(catalog, "utf8");
    expect(initial).toContain("Open your notebook");
    expect(await checkCatalogs(config, root)).toContain(
      "Missing or incomplete es translation: Open your notebook",
    );

    const rows = JSON.parse(initial) as { translations: Record<string, string> }[];
    rows[0].translations.es = "Abre tu cuaderno";
    const translated = `${JSON.stringify(rows, null, 2)}\n`;
    await writeFile(catalog, translated);
    expect(await checkCatalogs(config, root)).toEqual([]);

    await writeFile(source, "<button>Close your notebook</button>\n");
    await Hub.create("build", config, root);
    expect(await readFile(catalog, "utf8")).toBe(translated);
    expect(await checkCatalogs(config, root)).toContain("Extraction has pending changes: shared");

    await extract();
    expect(await checkCatalogs(config, root)).toContain(
      "Missing or incomplete es translation: Close your notebook",
    );
    expect(await readFile(catalog, "utf8")).not.toContain("Abre tu cuaderno");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizePath } from "vite";
import { generatedDir, getConfig, Hub } from "wuchale";
import { toViteError, trimViteQueries, wuchale } from "wuchale/vite";

import type { Plugin } from "vite";
import type { FS } from "wuchale";

const viteQueryParams = new Set(["v", "t", "sentry-auto-wrap", "tsr-split"]);
const routeCatalogsModule = "virtual:mistria-route-catalogs";
const routeCatalogPrefix = `${routeCatalogsModule}/`;

export function wuchaleForVite(configPath: string, snapshot: boolean): Plugin[] {
  const root = path.dirname(configPath);
  const modules = new Map<string, string>();
  let config: Awaited<ReturnType<typeof getConfig>>;
  let generated: string;
  let routeFiles: Set<string>;
  const routeCatalogs: Plugin = {
    async config() {
      config = await getConfig(configPath);
      generated = path.resolve(root, config.localesDir, generatedDir);
      for (const locale of config.locales) {
        if (!/^[A-Za-z0-9-]+$/u.test(locale)) throw new Error(`Invalid locale for Vite: ${locale}`);
      }
      // Wuchale starts the configured group IDs at 1. Group zero duplicates every route message.
      const groups = config.adapters.route?.loading.group ?? [];
      routeFiles = new Set(
        groups.flatMap((_, index) =>
          config.locales.map((locale) => `route.${index + 1}.${locale}.compiled.js`),
        ),
      );
    },
    load(id) {
      if (id !== `\0${routeCatalogsModule}`) return;
      // Only fixed strings, numeric IDs, and validated locale tags enter the generated source.
      const imports = [...routeFiles].map(
        (file) => `"${file}": () => import("${routeCatalogPrefix}${file}")`,
      );
      return `export default {${imports.join(",")}};`;
    },
    name: "mistria:route-catalogs",
    resolveId(id) {
      if (id === routeCatalogsModule) return `\0${routeCatalogsModule}`;
      if (!id.startsWith(routeCatalogPrefix)) return;
      const file = id.slice(routeCatalogPrefix.length);
      return routeFiles.has(file) ? normalizePath(path.join(generated, file)) : undefined;
    },
  };
  if (!snapshot) {
    const dev = wuchale({ configPath });
    return [
      routeCatalogs,
      {
        ...dev,
        async handleHotUpdate(context) {
          await dev.handleHotUpdate(context);
        },
      },
    ];
  }

  let mode: "build" | "dev";
  let compilation: Promise<Hub>;
  const fs: FS = {
    exists: async (file) => (await fs.read(file)) !== null,
    mkdir: () => undefined,
    async read(file) {
      // Mark this hub as its own owner without registering disk PID cleanup.
      if (file === path.join(generated, "dev.pid")) return String(process.pid);
      const staged = modules.get(file);
      if (staged !== undefined || file.startsWith(generated + path.sep)) return staged ?? null;
      try {
        return await readFile(file, "utf8");
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        return null;
      }
    },
    unlink: (file) => modules.delete(file),
    write(file, content) {
      modules.set(file, content);
    },
  };

  const compiler: Plugin = {
    async buildStart() {
      // Client and SSR environments must share the same assigned indices and catalog modules.
      compilation ??= Hub.create(mode, { ...config, ai: null }, root, [], 0, fs, toViteError);
      await compilation;
    },
    config(_, { mode: viteMode }) {
      // Match the upstream plugin so production builds keep source text for uncataloged messages.
      mode = viteMode === "build" ? "build" : "dev";
      return {
        optimizeDeps: {
          exclude: [
            ...new Set(Object.values(config.adapters).flatMap((adapter) => adapter.addImports)),
          ],
        },
      };
    },
    configureVitest({ defineCacheKeyGenerator }) {
      // Vitest hashes files from disk, which can contain the dev server's older catalog.
      defineCacheKeyGenerator(({ id }) => (modules.has(path.normalize(id)) ? false : undefined));
    },
    load: {
      handler(id) {
        return modules.get(path.normalize(id));
      },
      order: "pre",
    },
    name: "mistria:wuchale-snapshot",
    resolveId(source, importer) {
      if (!path.isAbsolute(source) && (!importer || !source.startsWith("."))) return;
      const file = importer ? path.resolve(path.dirname(importer), source) : path.normalize(source);
      return modules.has(file) ? normalizePath(file) : undefined;
    },
    transform: {
      async handler(code, id, options) {
        const hub = await compilation;
        return hub.transform(code, trimViteQueries(id, viteQueryParams), options?.ssr);
      },
      order: "pre",
    },
  };
  return [routeCatalogs, compiler];
}

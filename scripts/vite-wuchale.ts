import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { normalizePath } from "vite";
import { generatedDir, getConfig, Hub } from "wuchale";
import { toViteError, trimViteQueries, wuchale } from "wuchale/vite";

import type { Plugin } from "vite";
import type { FS } from "wuchale";

const viteQueryParams = new Set(["v", "t", "sentry-auto-wrap", "tsr-split"]);
const routeCatalogsModule = "\0virtual:mistria-route-catalogs";

export function wuchaleForVite(configPath: string, snapshot: boolean): Plugin[] {
  const root = path.dirname(configPath);
  const modules = new Map<string, string>();
  let config: Awaited<ReturnType<typeof getConfig>>;
  let generated: string;
  const routeCatalogs: Plugin = {
    async config() {
      config = await getConfig(configPath);
      generated = path.resolve(root, config.localesDir, generatedDir);
    },
    async load(id) {
      if (id !== routeCatalogsModule) return;
      const files = snapshot
        ? [...modules.keys()]
            .filter((file) => path.dirname(file) === generated)
            .map((file) => path.basename(file))
        : await readdir(generated);
      // Only load the route groups. Group zero duplicates every route message.
      const imports = files
        .filter((file) => /^route\.[1-9]\d*\.[^.]+\.compiled\.js$/u.test(file))
        .toSorted()
        .map((file) => {
          const specifier = normalizePath(path.join(generated, file));
          return `${JSON.stringify(file)}: () => import(${JSON.stringify(specifier)})`;
        });
      return `export default {${imports.join(",")}};`;
    },
    name: "mistria:route-catalogs",
    resolveId(id) {
      return id === routeCatalogsModule.slice(1) ? routeCatalogsModule : undefined;
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
    config(_, { command }) {
      mode = command === "build" ? "build" : "dev";
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

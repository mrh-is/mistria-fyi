import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { build, createServer } from "vite";
import { expect, it } from "vitest";
import { getConfig, Hub } from "wuchale";

import { wuchaleForVite } from "./vite-wuchale.js";

import type routeCatalogsModule from "virtual:mistria-route-catalogs";

it("requires every configured route catalog at build time and ignores extra files", async () => {
  const root = await mkdtemp(path.resolve("node_modules/.wuchale-test-"));
  try {
    const configPath = path.join(root, "wuchale.config.mjs");
    const directory = path.join(root, "locales", ".wuchale");
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "route.1.en.compiled.js"),
      "export const c = ['English'];",
    );
    await writeFile(path.join(directory, "route.2.en.compiled.js"), "export const c = ['Extra'];");
    await writeFile(
      configPath,
      `export default {
        adapters: { route: { loading: { group: ["entry.js"] } } },
        locales: ["en", "ja"],
        localesDir: "locales",
      };`,
    );
    await writeFile(
      path.join(root, "entry.js"),
      'export { default } from "virtual:mistria-route-catalogs";',
    );

    const [routeCatalogs] = wuchaleForVite(configPath, false);
    await expect(
      build({
        build: { ssr: "entry.js", write: false },
        configFile: false,
        logLevel: "silent",
        plugins: [routeCatalogs],
        root,
      }),
    ).rejects.toThrow("route.1.ja.compiled.js");
    await writeFile(
      path.join(directory, "route.1.ja.compiled.js"),
      "export const c = ['Japanese'];",
    );

    const server = await createServer({
      configFile: false,
      plugins: [routeCatalogs],
      root,
      server: { middlewareMode: true, watch: null, ws: false },
    });
    try {
      const { default: loaders } = (await server.ssrLoadModule("/entry.js")) as {
        default: typeof routeCatalogsModule;
      };
      expect(Object.keys(loaders)).toEqual(["route.1.en.compiled.js", "route.1.ja.compiled.js"]);
      await expect(loaders["route.1.en.compiled.js"]?.()).resolves.toMatchObject({
        c: ["English"],
      });
      await expect(loaders["route.1.ja.compiled.js"]?.()).resolves.toMatchObject({
        c: ["Japanese"],
      });
    } finally {
      await server.close();
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it("transforms messages against the current catalog while another process owns the disk catalog", async () => {
  const root = await mkdtemp(path.resolve("node_modules/.wuchale-test-"));
  const configPath = path.join(root, "wuchale.config.mjs");
  const catalogPath = path.join(root, "messages.json");
  const compiledPath = path.join(root, "locales/.wuchale/app.0.en.compiled.js");
  const pidPath = path.join(root, "locales/.wuchale/dev.pid");
  const previousOwner = String(process.ppid);
  const messages = ["Welcome", ["one item", "many items"]];
  const writeCatalog = async (entries: readonly (string | string[])[]) => {
    await writeFile(catalogPath, JSON.stringify(entries));
  };

  try {
    await writeFile(
      configPath,
      `import { adapter } from "wuchale/adapter-vanilla";
       export default {
         ai: null,
         dev: "read",
         localesDir: "locales",
         adapters: {
           app: adapter({
             files: "entry.js",
             loading: { direct: true },
             storage: ({ fs, root }) => ({
               files: [root + "/messages.json"],
               key: "test",
               save() {},
               async load() {
                 return JSON.parse(await fs.read(this.files[0])).map((text) => ({
                   references: [{ file: "entry.js", refs: [null] }],
                   translations: new Map([["en", text]]),
                   attribs: {},
                   urlAdapters: [],
                 }));
               },
             }),
           }),
         },
       };`,
    );
    await writeFile(
      path.join(root, "entry.js"),
      `import plural from "./locales/plural.js";
       export const render = (count) => plural(count, ["one item", "many items"]);
       export const renderMissing = (count) => plural(count, ["one uncataloged item", "many uncataloged items"]);`,
    );
    await writeCatalog(messages);
    await Hub.create("build", await getConfig(configPath), root);
    const previousCatalog = await readFile(compiledPath, "utf8");
    expect(previousCatalog).toContain('"Welcome"');
    await writeFile(pidPath, previousOwner);
    await writeCatalog(messages.toReversed());

    const server = await createServer({
      configFile: false,
      plugins: wuchaleForVite(configPath, true),
      root,
      server: { middlewareMode: true, watch: null, ws: false },
    });
    try {
      const { render } = (await server.ssrLoadModule("/entry.js")) as {
        render: (count: number) => string;
      };
      expect(render(1)).toBe("one item");
      expect(render(2)).toBe("many items");
      expect(await readFile(compiledPath, "utf8")).toBe(previousCatalog);
      expect(await readFile(pidPath, "utf8")).toBe(previousOwner);
    } finally {
      await server.close();
    }
    await build({
      build: { ssr: "entry.js" },
      configFile: false,
      logLevel: "silent",
      plugins: wuchaleForVite(configPath, true),
      root,
    });
    const built = await readFile(path.join(root, "dist", "entry.js"), "utf8");
    expect(built).toContain("many uncataloged items");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

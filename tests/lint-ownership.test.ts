// Pins which linter owns which surface (docs/development-workflow.md#tool-ownership). Each probe in
// tests/lint-probes/ breaks the same rules on purpose: an untyped oxlint rule (`no-debugger`), a
// type-aware oxlint rule (`no-floating-promises`), and, in the template, two ESLint rules.
//
// The `.svelte` expectation records a known gap: tsgolint doesn't read `.svelte` files, so typed
// rules skip their `<script>` blocks. When this test fails because that rule starts firing there,
// tsgolint has gained Svelte support; revisit the oxlint/ESLint boundary.
//
// oxfmt formats `.svelte` files only when `.oxfmtrc.json` enables its `svelte` option; without it,
// `oxfmt --check` skips them silently. The last test catches that.
import { ESLint } from "eslint";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";

const probeDirectory = "tests/lint-probes";

interface OxlintReport {
  diagnostics: { code: string; filename: string }[];
}

function oxlintRules(): Map<string, Set<string>> {
  const { stdout } = spawnSync(
    "node_modules/.bin/oxlint",
    [
      "--type-aware",
      "--disable-nested-config",
      "--config",
      `${probeDirectory}/oxlintrc.probe.json`,
      "--format",
      "json",
      probeDirectory,
    ],
    // oxlint exits nonzero because the probes have errors; the report is still on stdout.
    { encoding: "utf8" },
  );
  const report = JSON.parse(stdout) as OxlintReport;
  const rules = new Map<string, Set<string>>();
  for (const { code, filename } of report.diagnostics) {
    const file = filename.slice(probeDirectory.length + 1);
    rules.set(file, (rules.get(file) ?? new Set()).add(code));
  }
  return rules;
}

async function eslintRules(file: string): Promise<string[]> {
  const eslint = new ESLint({
    ignore: false,
    overrideConfig: {
      files: [`${probeDirectory}/**`],
      rules: { "local/no-hardcoded-ui-text": "error" },
    },
  });
  const results = await eslint.lintFiles([`${probeDirectory}/${file}`]);
  return results
    .flatMap((result) => result.messages)
    .map((message) => message.ruleId ?? "")
    .toSorted();
}

describe("lint tool ownership", () => {
  const oxlint = oxlintRules();
  const untyped = "eslint(no-debugger)";
  const typed = "typescript(no-floating-promises)";

  it.each(["probe.ts", "probe.svelte.ts"])("oxlint runs untyped & typed rules on %s", (file) => {
    expect(oxlint.get(file)).toContain(untyped);
    expect(oxlint.get(file)).toContain(typed);
  });

  it("oxlint runs untyped rules, but not typed rules, in .svelte <script> blocks", () => {
    expect(oxlint.get("probe.svelte")).toContain(untyped);
    expect(oxlint.get("probe.svelte")).not.toContain(typed);
  });

  it("ESLint owns Svelte template rules", async () => {
    await expect(eslintRules("probe.svelte")).resolves.toStrictEqual([
      "local/no-hardcoded-ui-text",
      "local/no-raw-internal-href",
    ]);
  });

  it("oxfmt formats .svelte files", () => {
    const { stdout } = spawnSync(
      "node_modules/.bin/oxfmt",
      ["--stdin-filepath", "src/lib/components/probe.svelte"],
      { encoding: "utf8", input: "<script lang=\"ts\">\n  import x from './x.js';\n</script>\n" },
    );
    expect(stdout).toContain('import x from "./x.js";');
  });

  it("ESLint leaves script rules to oxlint", async () => {
    await expect(eslintRules("probe.svelte.ts")).resolves.toStrictEqual([]);
  });

  it("checks app templates for hardcoded text, excluding vendored, dev, and fixture files", async () => {
    const eslint = new ESLint();
    for (const file of [
      "src/lib/components/source-segment-text.svelte",
      "src/lib/components/future-feature.svelte",
      "src/lib/components/spoiler.svelte",
      "src/routes/everything/+page.svelte",
      "src/routes/+error.svelte",
    ]) {
      const config = (await eslint.calculateConfigForFile(file)) as
        | undefined
        | { rules?: Record<string, [number]> };
      expect(config?.rules?.["local/no-hardcoded-ui-text"]?.[0], file).toBe(2);
    }
    for (const file of [
      "src/lib/components/ui/dialog/dialog-content.svelte",
      "src/routes/dev/fonts/+page.svelte",
      "src/lib/components/foldout-panel.test-harness.svelte",
    ]) {
      const config = (await eslint.calculateConfigForFile(file)) as
        | undefined
        | { rules?: Record<string, [number]> };
      expect(config?.rules?.["local/no-hardcoded-ui-text"], file).toBeUndefined();
    }
  });
});

describe("engine import boundary", () => {
  it("rejects store & component type imports through aliases and repeated parent segments", async () => {
    // Use real engine paths so the production override, not a copied rule, selects the probes.
    const nestedDirectory = await mkdtemp("src/lib/engine/lint-probe-");
    const rootProbe = `src/lib/engine/${basename(nestedDirectory)}.ts`;
    const nestedProbe = join(nestedDirectory, "probe.ts");
    try {
      await writeFile(
        rootProbe,
        [
          'import type { AliasStore } from "#lib/stores/probe.js";',
          'import type { AliasComponent } from "#lib/components/probe.js";',
          'import type { RelativeStore } from "../stores/probe.js";',
          'import type { RelativeComponent } from "../components/probe.js";',
          'import type { Domain } from "../types/probe.js";',
          "export type Probe = AliasStore | AliasComponent | RelativeStore | RelativeComponent | Domain;",
        ].join("\n"),
      );
      await writeFile(
        nestedProbe,
        [
          'import type { Store } from "../../stores/probe.js";',
          'import type { Component } from "../../components/probe.js";',
          'import type { Domain } from "../../types/probe.js";',
          "export type Probe = Store | Component | Domain;",
        ].join("\n"),
      );
      const result = spawnSync(
        "node_modules/.bin/oxlint",
        ["--config", ".oxlintrc.json", "--format", "json", rootProbe, nestedProbe],
        { encoding: "utf8" },
      );
      expect(result.error).toBeUndefined();
      const report = JSON.parse(result.stdout) as OxlintReport;
      const restricted = report.diagnostics.filter(
        ({ code }) => code === "eslint(no-restricted-imports)",
      );
      expect(restricted.filter(({ filename }) => filename === rootProbe)).toHaveLength(4);
      expect(restricted.filter(({ filename }) => filename === nestedProbe)).toHaveLength(2);
      expect(result.status).toBe(1);
    } finally {
      await rm(rootProbe, { force: true });
      await rm(nestedDirectory, { force: true, recursive: true });
    }
  });
});

describe("utils import boundary", () => {
  it("rejects imports from the layers built on utils", async () => {
    // Use a real utils path so the production override, not a copied rule, selects the probe.
    const probe = `src/lib/utils/lint-probe-${process.pid}.ts`;
    const layers = [
      "components",
      "stores",
      "controllers",
      "effects",
      "sources",
      "pwa",
      "presentation",
    ];
    try {
      await writeFile(
        probe,
        [
          ...layers.map(
            (layer, index) => `import type { T${index} } from "#lib/${layer}/probe.js";`,
          ),
          'import type { Relative } from "../stores/probe.js";',
          'import type { Sibling } from "#lib/utils/probe.js";',
          'import type { Data } from "#lib/data/probe.js";',
          `export type Probe = ${layers.map((_, index) => `T${index}`).join(" | ")} | Relative | Sibling | Data;`,
        ].join("\n"),
      );
      const result = spawnSync(
        "node_modules/.bin/oxlint",
        ["--config", ".oxlintrc.json", "--format", "json", probe],
        { encoding: "utf8" },
      );
      expect(result.error).toBeUndefined();
      const report = JSON.parse(result.stdout) as OxlintReport;
      const restricted = report.diagnostics.filter(
        ({ code }) => code === "eslint(no-restricted-imports)",
      );
      expect(restricted).toHaveLength(layers.length + 1);
      expect(result.status).toBe(1);
    } finally {
      await rm(probe, { force: true });
    }
  });
});

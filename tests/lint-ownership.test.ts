// Pins which linter owns which surface (docs/development-workflow.md#tool-ownership). Each probe in
// tests/lint-probes/ breaks the same rules on purpose: an untyped oxlint rule (`no-debugger`), a
// type-aware oxlint rule (`no-floating-promises`), and, in the template, two ESLint rules.
//
// The `.svelte` expectation records a known gap: tsgolint doesn't read `.svelte` files, so typed
// rules skip their `<script>` blocks. When this test fails because that rule starts firing there,
// tsgolint has gained Svelte support; revisit the oxlint/ESLint boundary.
import { ESLint } from "eslint";
import { spawnSync } from "node:child_process";
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
    // `no-hardcoded-ui-text` normally applies only to already-localized files.
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

  it("ESLint leaves script rules to oxlint", async () => {
    await expect(eslintRules("probe.svelte.ts")).resolves.toStrictEqual([]);
  });
});

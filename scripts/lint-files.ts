import "#scripts/lib/require-pinned-node";

import { pathToFileURL } from "node:url";

import { runPnpm } from "#scripts/lib/agent-hook";

/** The same tools & scopes as the full lint scripts, with an explicit changed-file mode. */
export function lintCommands(files: string[] | undefined, fix: boolean): string[][] {
  const format = ["exec", "oxfmt", ...(fix ? [] : ["--check"])];
  const oxlint = [
    "exec",
    "oxlint",
    "--type-aware",
    "--disable-nested-config",
    ...(fix ? ["--fix"] : ["--deny-warnings"]),
  ];
  const eslint = [
    "exec",
    "eslint",
    "--cache",
    "--cache-location",
    "node_modules/.cache/eslint/",
    ...(fix ? ["--fix"] : ["--max-warnings=0"]),
  ];
  const stylelint = ["exec", "stylelint", ...(fix ? ["--fix"] : ["--max-warnings=0"])];
  const directives = ["exec", "node", "scripts/check-lint-directives.ts"];
  const decisions = ["run", "decisions"];
  if (files === undefined) {
    return [
      format,
      oxlint,
      [...eslint, "**/*.svelte", "**/*.svelte.{js,ts}"],
      [...stylelint, "src/**/*.{css,svelte}"],
      ...(fix ? [] : [directives, decisions, ["run", "lint:shell"]]),
    ];
  }
  if (files.length === 0) {
    return [];
  }
  const scriptFiles = files.filter((file) => /\.(?:[cm]?[jt]sx?|svelte)$/.test(file));
  const svelteFiles = files.filter((file) => /\.svelte(?:\.[jt]s)?$/.test(file));
  const styleFiles = files.filter((file) => /^src[/\\].*\.(?:css|svelte)$/.test(file));
  return [
    [...format, "--no-error-on-unmatched-pattern", "--", ...files],
    ...(scriptFiles.length > 0 ? [[...oxlint, "--", ...scriptFiles]] : []),
    ...(svelteFiles.length > 0 ? [[...eslint, "--", ...svelteFiles]] : []),
    ...(styleFiles.length > 0 ? [[...stylelint, "--", ...styleFiles]] : []),
    ...(!fix && scriptFiles.length > 0 ? [[...directives, "--", ...scriptFiles]] : []),
    ...(!fix && files.some((file) => file.endsWith(".sh")) ? [["run", "lint:shell"]] : []),
    ...(!fix &&
    files.some((file) =>
      /^(?:docs[/\\](?:decisions[/\\]|decision-(?:index|metadata)\.md$)|scripts[/\\]decision-index(?:\.test)?\.ts$)/.test(
        file,
      ),
    )
      ? [decisions]
      : []),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const fix = args[0] === "--fix";
  if (fix) {
    args.shift();
  }
  if (args.length > 0 && args[0] !== "--files") {
    throw new Error("Usage: lint-files.ts [--fix] [--files <paths...>]");
  }
  for (const command of lintCommands(args[0] === "--files" ? args.slice(1) : undefined, fix)) {
    const result = runPnpm(command, process.cwd());
    process.stdout.write(result.output);
    if (result.status !== 0) {
      process.exitCode = result.status;
      break;
    }
  }
}

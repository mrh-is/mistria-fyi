import "#scripts/lib/require-pinned-node";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { LOCALE_CODES } from "../src/lib/types/locale.js";
import { compileUiMessage } from "./lib/compile-ui-catalog.js";
import { readUiMessageSources } from "./lib/ui-message-sources.js";

/** Generates a static export per message so route bundles can tree-shake unused copy. */
export async function compileUiMessages(
  root = path.join(import.meta.dirname, ".."),
  checkOnly = false,
): Promise<void> {
  const sources = readUiMessageSources(path.join(root, "messages"), LOCALE_CODES);
  const declarations = ['import type { LocaleCode } from "#lib/types/locale.js";'];
  const header = [
    "// @ts-nocheck: generated JavaScript is paired with typed declarations.",
    'import { getLocale } from "#lib/i18n/locale-runtime.js";',
  ];
  const modules = new Map<string, string[]>();
  for (const key of Object.keys(sources.en)) {
    const functions = [...header];
    modules.set(key, functions);
    const compiled = LOCALE_CODES.map((locale) => {
      const source = sources[locale][key];
      // Japanese and Korean put all of this keyboard instruction after the keycap.
      const emptyPrefix =
        key === "import_step_press_prefix" && (locale === "ja" || locale === "ko");
      if (typeof source === "string" && !source.trim() && !emptyPrefix) {
        throw new Error(`Empty ${locale} UI translation for ${key}`);
      }
      return compileUiMessage(key, source);
    });
    const english = compiled[0];
    if (
      compiled.some(
        (entry) =>
          entry.selector !== english.selector ||
          entry.args.length !== english.args.length ||
          !entry.args.every((arg) => english.args.includes(arg)),
      )
    ) {
      throw new Error(`Translation arguments differ for ${key}`);
    }
    const byLocale = Object.fromEntries(
      LOCALE_CODES.map((locale, index) => [locale, compiled[index]]),
    );
    const args = compiled[0].args;
    const inputs =
      args.length === 0
        ? "inputs?: Record<never, never>"
        : `inputs: { ${args.map((name) => `${name}: NonNullable<unknown>`).join("; ")} }`;
    declarations.push(
      `export function ${key}(${inputs}, options?: { locale?: LocaleCode }): string;`,
    );
    if (
      compiled.every(
        (entry) =>
          !entry.selector && entry.args.length === 0 && typeof entry.variants.other === "string",
      )
    ) {
      functions.push(
        `export function ${key}(_inputs, options) {`,
        "  const locale = options?.locale ?? getLocale();",
        ...LOCALE_CODES.slice(1).map(
          (locale, index) =>
            `  if (locale === ${JSON.stringify(locale)}) return ${JSON.stringify(compiled[index + 1].variants.other)};`,
        ),
        `  return ${JSON.stringify(english.variants.other)};`,
        "}",
      );
      continue;
    }
    functions.push(
      'import { renderKeyedMessage } from "#lib/i18n/keyed-message-runtime.js";',
      `const ${key}Data = ${JSON.stringify(byLocale)};`,
      `export function ${key}(inputs, options) {`,
      "  const locale = options?.locale ?? getLocale();",
      `  const definition = ${key}Data[locale] ?? ${key}Data.en;`,
      "  return renderKeyedMessage(definition.variants, definition.args.map((key) => inputs?.[key]), locale, definition.selector ? inputs?.[definition.selector] : undefined);",
      "}",
    );
  }
  if (checkOnly) return;
  const out = path.join(root, "src", "lib", "ui-messages");
  const messages = path.join(out, "keys");
  await mkdir(messages, { recursive: true });
  const index = [...modules.keys()].map((key) => `export { ${key} } from "./keys/${key}.js";`);
  await Promise.all([
    ...[...modules].map(([key, functions]) =>
      writeIfChanged(path.join(messages, `${key}.js`), functions),
    ),
    writeIfChanged(path.join(out, "messages.js"), index),
    writeIfChanged(path.join(out, "messages.d.ts"), declarations),
  ]);
}

async function writeIfChanged(file: string, lines: string[]): Promise<void> {
  const source = `${lines.join("\n")}\n`;
  const previous = await readFile(file, "utf8").catch((error: unknown) => {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    return undefined;
  });
  if (source !== previous) await writeFile(file, source);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await compileUiMessages(undefined, process.argv.includes("--check"));
}

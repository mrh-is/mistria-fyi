import { compileTranslation } from "wuchale/compiler";

import type { Mixed } from "wuchale";

interface PluralSource {
  declarations: string[];
  match: Record<string, string>;
  selectors: string[];
}

type SourceMessage = [PluralSource] | string;
export type SourceCatalog = Record<string, SourceMessage>;

export interface CompiledUiMessage {
  args: string[];
  selector?: string;
  variants: Record<string, Mixed | string>;
}

const PLACEHOLDER = /\{([a-zA-Z][\w]*)\}/gu;
const PLURAL = /^local (\w+) = (\w+): plural$/u;
const CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);

/** Compiles keyed messages while preserving the callers' named arguments. */
export function compileUiMessage(key: string, source: SourceMessage): CompiledUiMessage {
  if (typeof source === "string") {
    const args = [...new Set([...source.matchAll(PLACEHOLDER)].map((match) => match[1]))];
    return { args, variants: { other: compileText(key, source, args) } };
  }

  const [plural] = source;
  const declarations = plural.declarations.filter((declaration) =>
    declaration.startsWith("local "),
  );
  const spec = PLURAL.exec(declarations[0] ?? "");
  if (
    !spec ||
    declarations.length !== 1 ||
    source.length !== 1 ||
    plural.selectors.length !== 1 ||
    plural.selectors[0] !== spec[1]
  ) {
    throw new Error(`Unsupported selector in ${key}`);
  }
  const args = plural.declarations
    .filter((declaration) => declaration.startsWith("input "))
    .map((declaration) => declaration.slice("input ".length));
  const variants = Object.fromEntries(
    Object.entries(plural.match).map(([condition, text]) => {
      const prefix = `${spec[1]}=`;
      const category = condition.slice(prefix.length);
      if (!condition.startsWith(prefix) || !CATEGORIES.has(category)) {
        throw new Error(`Unsupported plural category in ${key}: ${condition}`);
      }
      return [category, compileText(key, text, args)];
    }),
  );
  if (!Object.hasOwn(variants, "other") || !args.includes(spec[2])) {
    throw new Error(`Incomplete plural message: ${key}`);
  }
  return { args, selector: spec[2], variants };
}

function compileText(key: string, text: string, args: string[]): Mixed | string {
  const numbered = text.replaceAll(PLACEHOLDER, (_whole, name: string) => {
    const index = args.indexOf(name);
    if (index === -1) throw new Error(`Unknown argument ${name} in ${key}`);
    return `{${String(index)}}`;
  });
  const compiled = compileTranslation(numbered);
  if (typeof compiled === "string") return compiled;
  if (compiled.every((part) => typeof part === "string" || typeof part === "number")) {
    return compiled;
  }
  throw new Error(`Unexpected nested markup in keyed message: ${key}`);
}

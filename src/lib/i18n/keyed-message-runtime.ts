import toRuntime from "wuchale/runtime";

import type { Mixed } from "wuchale";

import type { LocaleCode } from "#lib/types/locale.js";

const runtime = toRuntime();
const rules = new Map<LocaleCode, Intl.PluralRules>();

export function renderKeyedMessage(
  variants: Readonly<Record<string, Mixed | string>>,
  args: unknown[],
  locale: LocaleCode,
  count?: unknown,
): string {
  let category = "other";
  if (count !== undefined) {
    let rule = rules.get(locale);
    if (!rule) {
      rule = new Intl.PluralRules(locale);
      rules.set(locale, rule);
    }
    category = rule.select(Number(count));
  }
  const compiled = variants[category] ?? variants.other;
  return typeof compiled === "string" ? compiled : runtime.x(compiled, args, 0);
}

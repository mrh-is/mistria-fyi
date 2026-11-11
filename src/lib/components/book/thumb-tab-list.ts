import { categoryForKey, categoryKeyForPathname } from "#lib/data/categories.js";
import { CATEGORY_KEYS } from "#lib/engine/categories.js";
import * as m from "#lib/paraglide/messages.js";

import type { CategoryKey } from "#lib/engine/categories.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type { Path } from "$app/types";

/** One thumb tab: Home, a category, or Everything. */
export interface ThumbTab {
  /** The tab's cloth color, as a whole `var()` reference. */
  color: string;
  /** The icon's color on that cloth. */
  ink: string;
  key: "everything" | "home" | CategoryKey;
  name: string;
  path: Path;
}

/** The thumb tabs in book order: Home on top, the categories, then Everything at the foot. */
export function thumbTabs(locale: LocaleCode): ThumbTab[] {
  return [
    {
      color: "var(--color-paper-raised)",
      ink: "var(--color-ink)",
      key: "home",
      name: m.book_tab_home({}, { locale }),
      path: "",
    },
    ...CATEGORY_KEYS.map((key): ThumbTab => {
      const { color, href, name } = categoryForKey(key, locale);
      return { color, ink: "var(--color-ribbon-foreground)", key, name, path: href };
    }),
    {
      color: "var(--color-ink)",
      ink: "var(--color-paper)",
      key: "everything",
      name: m.home_everything_label({}, { locale }),
      path: "everything",
    },
  ];
}

/** The tab for an unprefixed route, or `undefined` for pages with no tab (About, Data, …). */
export function thumbTabKeyForPathname(pathname: string): ThumbTab["key"] | undefined {
  if (pathname === "/") return "home";
  if (pathname === "/everything") return "everything";
  return categoryKeyForPathname(pathname);
}

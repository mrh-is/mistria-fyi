import * as m from "#lib/ui-messages/messages.js";

import type { CategoryKey } from "#lib/engine/categories.js";
import type { LocaleCode } from "#lib/types/locale.js";

export { SITE_NAME, SITE_ORIGIN } from "./site.js";

/** A CSS color, as a `var()` reference to a token, that the page chrome reads as `--primary`. */
export type PageAccent = "var(--color-home-accent)" | `var(--color-category-${CategoryKey})`;

export interface PageMetadata {
  /** Colors the page chrome. Category pages use their own token; everything else is the home accent. */
  accent: PageAccent;
  description: string;
  /** Absent means indexable; the sitemap lists every page without a directive. */
  robots?: RobotsDirective;
  title: string;
  /** `"hidden"` removes the bottom toolbar entirely (legal & dev pages). */
  toolbar: "hidden" | ToolbarConfig;
}

/** What a `+page.ts` load supplies; `pageMetadata` fills in the rest. */
export interface PageMetadataInput {
  /** Defaults to the home accent. */
  accent?: PageAccent;
  description: string;
  robots?: RobotsDirective;
  title: string;
  /** Defaults to a visible toolbar with every optional control off. */
  toolbar?: "hidden" | Partial<ToolbarConfig>;
}

export type RobotsDirective = "noindex, follow" | "noindex, nofollow";

export interface ToolbarConfig {
  /** Shows the clock, which sets the season & weather the page's shelves read. */
  clock: boolean;
  /** Shows the filter button, on pages with source type filters. */
  filter: boolean;
  /** Shows the toolbar's in-page name filter (`toolbarState.searchQuery`). */
  search: boolean;
}

const DEFAULT_TOOLBAR: ToolbarConfig = { clock: false, filter: false, search: false };

export function errorPageMetadata(status: number, locale: LocaleCode): PageMetadata {
  return pageMetadata({
    description: m.error_page_description({}, { locale }),
    robots: "noindex, nofollow",
    title: String(status),
  });
}

/** Resolves every default so consumers never have to interpret an absent field. */
export function pageMetadata(input: PageMetadataInput): PageMetadata {
  const { accent = "var(--color-home-accent)", toolbar = {}, ...rest } = input;
  return {
    ...rest,
    accent,
    toolbar: toolbar === "hidden" ? "hidden" : { ...DEFAULT_TOOLBAR, ...toolbar },
  };
}

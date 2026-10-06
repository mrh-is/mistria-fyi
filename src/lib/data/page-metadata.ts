import * as m from "#lib/paraglide/messages.js";

import type { CategoryKey } from "#lib/data/categories.js";
import type { LocaleCode } from "#lib/types/locale.js";

export const SITE_ORIGIN = "https://mistria.fyi";
/** The product name; a proper noun that reads the same in every locale (`app_name` in each). */
export const SITE_NAME = "Mistria Field Guide";

/** A CSS color token (sans `--`) that the page chrome reads as `--primary`. */
export type PageAccent = "home-accent" | `cat-${CategoryKey}`;

export interface PageMetadata {
  /** Colors the page chrome. Category pages use their own token; everything else is the home accent. */
  accent: PageAccent;
  description: string;
  /** Absent means indexable; the sitemap lists every page without a directive. */
  robots?: RobotsDirective;
  title: string;
  /** `"hidden"` removes the bottom toolbar entirely (settings, legal, & dev pages). */
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
  /** Shows the toolbar's in-page name filter (`toolbarState.searchQuery`). */
  search: boolean;
  /** Shows the toolbar's season/weather & availability filters. */
  worldState: boolean;
}

const DEFAULT_TOOLBAR: ToolbarConfig = { search: false, worldState: false };

export function errorPageMetadata(status: number, locale: LocaleCode): PageMetadata {
  return pageMetadata({
    description: m.error_page_description({}, { locale }),
    robots: "noindex, nofollow",
    title: String(status),
  });
}

/** Resolves every default so consumers never have to interpret an absent field. */
export function pageMetadata(input: PageMetadataInput): PageMetadata {
  const { accent = "home-accent", toolbar = {}, ...rest } = input;
  return {
    ...rest,
    accent,
    toolbar: toolbar === "hidden" ? "hidden" : { ...DEFAULT_TOOLBAR, ...toolbar },
  };
}

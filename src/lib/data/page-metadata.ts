export const SITE_ORIGIN = "https://mistria.fyi";
export const SITE_NAME = "Mistria Field Guide";

export interface PageMetadata {
  description: string;
  /** Hides the bottom toolbar — for pages that aren't tracker categories (settings, legal). */
  hideToolbar?: boolean;
  robots?: RobotsDirective;
  /** Shows the toolbar's in-page name filter (`toolbarState.searchQuery`). */
  showSearch?: boolean;
  title: string;
  /** Shows the toolbar's season/weather & availability filters. */
  usesWorldState?: boolean;
}

type RobotsDirective = "noindex, follow" | "noindex, nofollow";

export function errorPageMetadata(status: number): PageMetadata {
  return {
    description: "The requested Fields of Mistria tracker page could not be found.",
    robots: "noindex, nofollow",
    title: String(status),
  };
}

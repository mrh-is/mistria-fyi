import type { Pathname } from "$app/types";

export const SITE_ORIGIN = "https://mistria.fyi";
export const SITE_NAME = "Mistria Field Guide";

export interface PageMetadata<Path extends string = Pathname> {
  description: string;
  path: Path;
  robots?: RobotsDirective;
  title: string;
}

type RobotsDirective = "noindex, follow" | "noindex, nofollow";

export function errorPageMetadata(path: string, status: number): PageMetadata<string> {
  return {
    description: "The requested Fields of Mistria tracker page could not be found.",
    path,
    robots: "noindex, nofollow",
    title: String(status),
  };
}

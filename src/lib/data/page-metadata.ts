export const SITE_ORIGIN = "https://mistria.fyi";
export const SITE_NAME = "Mistria Field Guide";

export interface PageMetadata {
  description: string;
  robots?: RobotsDirective;
  title: string;
}

type RobotsDirective = "noindex, follow" | "noindex, nofollow";

export function errorPageMetadata(status: number): PageMetadata {
  return {
    description: "The requested Fields of Mistria tracker page could not be found.",
    robots: "noindex, nofollow",
    title: String(status),
  };
}

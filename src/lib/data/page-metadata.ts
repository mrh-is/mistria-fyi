import type { Pathname } from "$app/types";

export const SITE_ORIGIN = "https://mistria.fyi";

export const INDEXABLE_PAGE_PATHS = [
  "/",
  "/almanac",
  "/animals",
  "/cosmetics",
  "/mines",
  "/museum",
  "/npcs",
  "/quests",
  "/recipes",
  "/renown",
  "/skills",
  "/all",
  "/about",
  "/privacy",
] as const satisfies readonly Pathname[];

export interface PageMetadata {
  description: string;
  robots?: RobotsDirective;
  title: string;
}
export interface ResolvedPageMetadata extends PageMetadata {
  canonicalUrl: string;
}

type RobotsDirective = "noindex, follow" | "noindex, nofollow";

export const PAGE_METADATA = {
  "/": {
    description:
      "Track museum donations, almanac finds, recipes, relationships, skills, quests, and more in Fields of Mistria.",
    title: "Fields of Mistria completion tracker — Mistria Field Guide",
  },
  "/about": {
    description:
      "Learn about the independent, unofficial Mistria Field Guide and the Fields of Mistria data it uses.",
    title: "About — Mistria Field Guide",
  },
  "/all": {
    description: "View and track every Fields of Mistria completion category in one checklist.",
    title: "Fields of Mistria checklist — Mistria Field Guide",
  },
  "/almanac": {
    description:
      "Track crops, forage, fish, insects, artifacts, and other almanac discoveries in Fields of Mistria.",
    title: "Almanac tracker — Mistria Field Guide",
  },
  "/animals": {
    description: "Track animal breeds, colors, and cosmetics for your Fields of Mistria farm.",
    title: "Animals tracker — Mistria Field Guide",
  },
  "/cosmetics": {
    description: "Track wardrobe and appearance unlocks in Fields of Mistria.",
    title: "Cosmetics tracker — Mistria Field Guide",
  },
  "/data": {
    description:
      "Import, transfer, back up, restore, or reset your Fields of Mistria tracking progress.",
    robots: "noindex, follow",
    title: "Data management — Mistria Field Guide",
  },
  "/dev/icons": {
    description:
      "Review the Fields of Mistria icon proof gallery used during Mistria Field Guide development.",
    robots: "noindex, nofollow",
    title: "Icon proof gallery — Mistria Field Guide",
  },
  "/mines": {
    description: "Track mine floors, spells, and exploration progress in Fields of Mistria.",
    title: "Mines tracker — Mistria Field Guide",
  },
  "/museum": {
    description: "Track every museum collection and donation in Fields of Mistria.",
    title: "Museum tracker — Mistria Field Guide",
  },
  "/npcs": {
    description: "Track friendship and romance progress with every Fields of Mistria character.",
    title: "Character relationship tracker — Mistria Field Guide",
  },
  "/privacy": {
    description:
      "Read how the Mistria Field Guide stores Fields of Mistria progress, handles feedback, and protects your privacy.",
    title: "Privacy policy — Mistria Field Guide",
  },
  "/quests": {
    description: "Track story quests, requests, and other objectives in Fields of Mistria.",
    title: "Quest tracker — Mistria Field Guide",
  },
  "/recipes": {
    description: "Track cooking and crafting recipes in Fields of Mistria.",
    title: "Recipe tracker — Mistria Field Guide",
  },
  "/renown": {
    description: "Track your town renown rank and rewards in Fields of Mistria.",
    title: "Renown tracker — Mistria Field Guide",
  },
  "/skills": {
    description: "Track skill levels and progression in Fields of Mistria.",
    title: "Skills tracker — Mistria Field Guide",
  },
} as const satisfies Partial<Record<Pathname, PageMetadata>>;

type MetadataPath = keyof typeof PAGE_METADATA;

export function resolvePageMetadata(pathname: string, status: number): ResolvedPageMetadata {
  const canonicalUrl = new URL(pathname, SITE_ORIGIN).href;

  if (status >= 400) {
    return {
      canonicalUrl,
      description: "The requested Fields of Mistria tracker page could not be found.",
      robots: "noindex, nofollow",
      title: `${status} — Mistria Field Guide`,
    };
  }

  if (isMetadataPath(pathname)) {
    return { ...PAGE_METADATA[pathname], canonicalUrl };
  }

  return {
    canonicalUrl,
    description: "Track your Fields of Mistria progress with Mistria Field Guide.",
    robots: "noindex, nofollow",
    title: "Mistria Field Guide",
  };
}

function isMetadataPath(pathname: string): pathname is MetadataPath {
  return Object.hasOwn(PAGE_METADATA, pathname);
}

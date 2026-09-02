export interface AccessibilityRoute {
  name: string;
  path: string;
}

export const accessibilityRoutes = [
  { name: "Home", path: "/" },
  { name: "Almanac", path: "/almanac" },
  { name: "Animals", path: "/animals" },
  { name: "Cosmetics", path: "/cosmetics" },
  { name: "Mines", path: "/mines" },
  { name: "Museum", path: "/museum" },
  { name: "NPCs", path: "/npcs" },
  { name: "Quests", path: "/quests" },
  { name: "Recipes", path: "/recipes" },
  { name: "Renown", path: "/renown" },
  { name: "Skills", path: "/skills" },
  { name: "All categories", path: "/all" },
  { name: "Privacy", path: "/privacy" },
  { name: "Settings", path: "/settings" },
] as const satisfies readonly AccessibilityRoute[];

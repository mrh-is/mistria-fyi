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
  { name: "Villagers", path: "/villagers" },
  { name: "Quests", path: "/quests" },
  { name: "Recipes", path: "/recipes" },
  { name: "Renown", path: "/renown" },
  { name: "Skills", path: "/skills" },
  { name: "All categories", path: "/all" },
  { name: "Data management", path: "/data" },
  { name: "About", path: "/about" },
  { name: "Privacy", path: "/privacy" },
  { name: "Legacy settings redirect", path: "/settings" },
] as const satisfies readonly AccessibilityRoute[];

/** Wuchale numbers the route groups in order, with 0 reserved for the aggregate catalog. */
export const ROUTE_UI_GROUPS = [
  { path: "", pattern: "src/routes/+page.svelte", shard: "home" },
  { path: "data", pattern: "src/routes/data/**", shard: "data" },
  { path: "everything", pattern: "src/routes/everything/**", shard: "everything" },
  { path: "privacy", pattern: "src/routes/privacy/**", shard: "privacy" },
  { path: "sync", pattern: "src/routes/sync/**", shard: "sync" },
] as const;

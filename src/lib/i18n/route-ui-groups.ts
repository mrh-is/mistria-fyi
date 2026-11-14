export const SYNC_CODE_SOURCE = "src/routes/sync/code-area.svelte";

/** Wuchale uses the last matching pattern, with 0 reserved for the aggregate catalog. */
export const ROUTE_UI_GROUPS = [
  { paths: [""], pattern: "src/routes/+page.svelte", shard: "home" },
  { paths: ["data"], pattern: "src/routes/data/**/*.svelte", shard: "data" },
  { paths: ["everything"], pattern: "src/routes/everything/**/*.svelte", shard: "everything" },
  { paths: ["privacy"], pattern: "src/routes/privacy/**/*.svelte", shard: "privacy" },
  { paths: ["sync"], pattern: "src/routes/sync/**/*.svelte", shard: "sync" },
  { paths: ["data", "sync"], pattern: SYNC_CODE_SOURCE, shard: "sync-code" },
] as const;

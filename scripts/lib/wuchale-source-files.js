export const aboutSvelteFiles = [
  "src/routes/about/about-copy.svelte",
  "src/lib/components/ai-disclosure-dialog.svelte",
];

export const aboutMetadataFile = "src/routes/about/about-metadata.ts";

export const errorSvelteFile = "src/routes/+error.svelte";
export const errorMetadataFile = "src/lib/data/page-metadata.ts";

export const uiMessageHelperGlob = "src/{lib,routes}/**/*-messages.ts";

export const sharedScriptFiles = [
  "src/lib/controllers/tracking-reminders.svelte.ts",
  "src/lib/presentation/shelves.ts",
  "src/lib/utils/format.ts",
  uiMessageHelperGlob,
];

export const sharedLocaleFiles = [
  "src/lib/components/sync/sync-question-copy.ts",
  "src/lib/data/categories.ts",
  "src/lib/data/item-variants.ts",
  "src/lib/data/source-filters.ts",
  "src/lib/effects/undo-toast.ts",
  "src/lib/presentation/merge-labels.ts",
  "src/lib/presentation/quest-sections.ts",
  "src/lib/presentation/source-labels.ts",
  "src/lib/sources/source-names.ts",
  "src/lib/sources/source-segments.ts",
];

export const sharedLocaleSvelteFiles = [
  "src/lib/components/page-search-status.svelte",
  "src/lib/components/search-guide-link.svelte",
];

export const routeSvelteFiles = [
  "src/routes/+page.svelte",
  "src/routes/data/+page.svelte",
  "src/routes/data/backup-card.svelte",
  "src/routes/data/danger-zone-card.svelte",
  "src/routes/data/import-card.svelte",
  "src/routes/data/last-import.svelte",
  "src/routes/data/merge-summary.svelte",
  "src/routes/data/sync-card.svelte",
  "src/routes/data/transfer-card.svelte",
  "src/routes/everything/+page.svelte",
  "src/routes/everything/section-header.svelte",
  "src/routes/everything/source-content.svelte",
  "src/routes/privacy/+page.svelte",
  "src/routes/sync/+page.svelte",
  "src/routes/sync/computer-setup.svelte",
  "src/routes/sync/find-save-step.svelte",
  "src/routes/sync/follow-setup.svelte",
  "src/routes/sync/only-save-note.svelte",
  "src/routes/sync/qr-scanner.svelte",
  "src/routes/sync/where-choice.svelte",
];

export const routeMetadataFiles = [
  "src/routes/(category)/almanac/+page.ts",
  "src/routes/(category)/animals/+page.ts",
  "src/routes/(category)/cosmetics/+page.ts",
  "src/routes/(category)/mines/+page.ts",
  "src/routes/(category)/museum/+page.ts",
  "src/routes/(category)/quests/+page.ts",
  "src/routes/(category)/recipes/+page.ts",
  "src/routes/(category)/renown/+page.ts",
  "src/routes/(category)/skills/+page.ts",
  "src/routes/(category)/villagers/+page.ts",
  "src/routes/+page.ts",
  "src/routes/data/+page.ts",
  "src/routes/everything/+page.ts",
  "src/routes/privacy/+page.ts",
  "src/routes/sync/+page.ts",
];

/** Components and routes use source extraction unless they have their own catalog or are fixtures. */
export const sharedSvelteFiles = {
  ignore: [
    "**/*.test-harness.svelte",
    "src/lib/components/ui/**",
    "src/routes/dev/icons/**",
    "src/routes/dev/og-image/**",
    ...aboutSvelteFiles,
    errorSvelteFile,
    ...routeSvelteFiles,
    ...sharedLocaleSvelteFiles,
  ],
  include: ["src/lib/components/**/*.svelte", "src/routes/**/*.svelte"],
};

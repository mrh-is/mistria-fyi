<script lang="ts">
  import { tick, untrack } from "svelte";
  import { MediaQuery, SvelteMap, SvelteSet } from "svelte/reactivity";

  import AllCompleted from "#lib/components/all-completed.svelte";
  import ConfirmSpoilerDialog from "#lib/components/confirm-spoiler-dialog.svelte";
  import LedgerIndex from "#lib/components/ledger/ledger-index.svelte";
  import LedgerNotice from "#lib/components/ledger/ledger-notice.svelte";
  import LedgerRow from "#lib/components/ledger/ledger-row.svelte";
  import LedgerSection from "#lib/components/ledger/ledger-section.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import { createRowCheckOff } from "#lib/controllers/check-off.svelte.js";
  import { createLedgerPage, useLedgerArrival } from "#lib/controllers/ledger-page.svelte.js";
  import { buildSourceChecklist } from "#lib/controllers/source-checklist.js";
  import { registerSourceFilters } from "#lib/controllers/source-filter-registration.svelte.js";
  import { trackerIndex } from "#lib/data/index.js";
  import { captureUndoFocus, showQuestToast, showUndoToast } from "#lib/effects/undo-toast.js";
  import { isCategoryComplete } from "#lib/engine/categories.js";
  import { isConditionVisible } from "#lib/engine/visibility.js";
  import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
  import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName, matchesTerms } from "#lib/utils/name-match.js";
  import { building } from "$app/env";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  import { categorySections } from "./category-sections-messages.js";

  import type { SourceChecklistRow } from "#lib/controllers/source-checklist.js";
  import type { Shelf } from "#lib/engine/shelves.js";
  import type { LedgerColumn } from "#lib/presentation/ledger.js";
  import type { LocaleCode } from "#lib/types/locale.js";
  import type { QuestId } from "#lib/types/tracker-data.js";

  import type { CategorySection, LedgerCategory } from "./category-sections-messages.js";

  let { category, locale }: { category: LedgerCategory; locale: LocaleCode } = $props();
  const categoryKey = untrack(() => category);
  const phone = new MediaQuery("max-width: 47.99rem", false);
  const folds = new SvelteMap(Object.entries(untrack(() => page.state.categoryLedgerFolds ?? {})));
  const revealed = new SvelteSet<string>();
  const checkOff = createRowCheckOff<string>({ animateLeaving: false });
  let pending = $state<string>();
  let revealDialogOpen = $state(false);

  registerSourceFilters(categoryKey, () => trackerIndex.categorySourceTypes[categoryKey]);

  let entries = $derived(
    buildSourceChecklist(userState.progressContext, locale, userState.state.showSpoilers, category),
  );
  let live = $derived(new Map(entries.map((entry) => [entry.key, entry])));
  let lookups = $derived(
    buildBaseSegmentLookups(computeSpoileredStoreIds(userState.progressionState), locale),
  );
  const {
    restoringScroll,
    snapshot: ledger,
    visible,
  } = createLedgerPage(
    () => locale,
    () => categorySections(category, entries, userState.progressContext, locale),
    (row) => {
      const names = [row.name, ...(row.searchNames ?? [])];
      const query = toolbarState.searchQuery;
      return (
        names.some((name) => matchesName(name, query, locale)) ||
        matchesTerms(names, row.searchTerms ?? [], query, locale)
      );
    },
    { scrollKey: categoryKey },
  );

  let hash = $derived(building ? "" : page.url.hash.slice(1));
  let restoredHash = $state(untrack(() => (page.state.categoryLedgerFolds ? hash : "")));
  let arrival = $derived(hash === restoredHash ? "" : hash);
  useLedgerArrival(() => (ledger.ready ? hash : ""), restoringScroll);

  $effect(() => {
    if (hash !== untrack(() => restoredHash)) restoredHash = "";
  });
  $effect(() => {
    const saved = Object.fromEntries(folds);
    void hash;
    untrack(() => {
      if (JSON.stringify(page.state.categoryLedgerFolds ?? {}) === JSON.stringify(saved)) return;
      void goto(page.url.href, {
        replace: true,
        shallow: true,
        state: { ...page.state, categoryLedgerFolds: saved },
      });
    });
  });

  const isFinished = ({ progress }: CategorySection) => progress.completed >= progress.total;
  const isCovered = (section: CategorySection) =>
    Boolean(section.spoilered && !userState.state.showSpoilers && !revealed.has(section.id));
  const shows = (section: CategorySection) =>
    section.rows.some((row) => visible(row) && toolbarState.matchesSourceFilters(row.sources));
  let indexSections = $derived(
    ledger.value
      .filter((section) => !isCovered(section))
      .map((section) => ({
        id: section.id,
        muted: !shows(section),
        name: section.name,
        progress: section.progress,
      })),
  );

  async function revealSection(): Promise<void> {
    if (!pending) return;
    const id = pending;
    revealed.add(id);
    folds.set(id, true);
    pending = undefined;
    await tick();
    document.getElementById(id)?.querySelector("h3")?.focus({ preventScroll: true });
  }

  function toggle(row: SourceChecklistRow, covered: boolean): void {
    const current = live.get(row.key);
    if (!current) return;
    const focus = captureUndoFocus();
    checkOff.run({
      category,
      covered,
      finish: ({ beforeRecipes, undo }) => {
        const completed = live.get(row.key)?.completed === true;
        if (row.reportCategory === "quest") {
          const added = [...userState.state.progress.almanacRecipes].filter(
            (id) => !beforeRecipes.has(id),
          );
          showQuestToast(
            row.name,
            userState.state.progress.questStates[row.id as QuestId] ?? "none",
            added,
            locale,
            undo,
            covered,
            focus,
          );
        } else {
          showUndoToast(row.name, completed, undo, covered, focus);
        }
        return completed;
      },
      hold: () =>
        ledger.value
          .filter(({ rows }) => rows.some(({ key }) => key === row.key))
          .map(
            ({ rows }) =>
              () =>
                rows.every(
                  ({ key, obtainable }) => !obtainable || live.get(key)?.completed === true,
                ),
          ),
      id: row.key,
      name: row.name,
      needsGuard:
        !current.completed &&
        (current.spoilered === true ||
          !isConditionVisible(row.visibility, userState.progressionState)),
      toggle: () => {
        const beforeRecipes = new Set(userState.state.progress.almanacRecipes);
        return { beforeRecipes, undo: current.toggle() };
      },
      visibility: row.visibility,
    });
  }
</script>

<SpoilerGuardDialog guard={checkOff.guard} />
<ConfirmSpoilerDialog
  revealSection
  bind:open={revealDialogOpen}
  onCancel={() => (pending = undefined)}
  onComplete={() => void revealSection()}
  onCompleteAndUpdate={() => void revealSection()}
/>
<LedgerNotice changed={ledger.needsRefresh} onRefresh={ledger.refresh} />
<LedgerIndex sections={indexSections}>
  {#each ledger.value as section, i (section.id)}
    {@render renderSection(section, false, i > 0)}
  {/each}
</LedgerIndex>
<AllCompleted isAllCompleted={isCategoryComplete(category, userState.progressContext)} />

{#snippet renderSection(section: CategorySection, subsection: boolean, divider: boolean)}
  {@const { id, name, progress, rows, subsections } = section}
  {@const folded = isFinished(section) || (!subsection && phone.current)}
  {#snippet contents()}
    {#each subsections ?? [] as child (child.id)}
      {@render renderSection(child, true, false)}
    {/each}
  {/snippet}
  <LedgerSection
    categoryDetails
    {subsection}
    {divider}
    {id}
    {locale}
    {name}
    {progress}
    {rows}
    {visible}
    {folded}
    contents={subsections ? contents : undefined}
    covered={isCovered(section)}
    onReveal={() => {
      pending = id;
      revealDialogOpen = true;
    }}
    openOnArrival={!isCovered(section) &&
      (arrival === id || subsections?.some((child) => child.id === arrival))}
    bind:open={() => folds.get(id) ?? !folded, (value) => folds.set(id, value)}
    {row}
  />
{/snippet}

{#snippet row(
  placement: CategorySection["rows"][number],
  shelf: Shelf,
  columns: readonly LedgerColumn[],
  discovery: boolean,
  highlighted: boolean,
  active: boolean,
  onFind: (event: Event) => void,
  searchMiss: boolean,
)}
  {@const current = live.get(placement.key) ?? placement}
  <LedgerRow
    {active}
    {category}
    {columns}
    completed={current.completed}
    disabled={current.disabled}
    {discovery}
    fact={placement.fact}
    {highlighted}
    id={placement.id}
    lookups={{ ...lookups, entityVisibility: placement.visibility }}
    name={placement.name}
    obtained={current.questState === "obtained"}
    {onFind}
    onToggle={(covered) => toggle(placement, covered)}
    {placement}
    reportCategory={placement.reportCategory}
    {searchMiss}
    {shelf}
    sprite={placement.sprite}
    subtitle={placement.subtitle}
  />
{/snippet}

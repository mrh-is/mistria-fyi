<script lang="ts" generics="Item, Key">
  import SectionGroupItem from "#lib/components/section-group-item.svelte";
  import ShelfHeading from "#lib/components/shelf-heading.svelte";
  import { getCompletionScope } from "#lib/controllers/completion-scope.svelte.js";
  import { SHELVES } from "#lib/engine/shelves.js";

  import type { Snippet } from "svelte";

  import type { SectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
  import type { Shelf } from "#lib/engine/shelves.js";

  let {
    forceOpen = false,
    getKey,
    grouping,
    items,
    section,
  }: {
    /** Opens every fold for as long as it holds, as a search does. */
    forceOpen?: boolean;
    getKey: (item: Item) => Key;
    grouping: SectionGrouping<Key>;
    items: readonly Item[];
    section: Snippet<[Item]>;
  } = $props();

  type Entry =
    | { closed: boolean; item: Item; key: Key; kind: "section" }
    | { count: number; key: Shelf; kind: "heading" };

  const completionScope = getCompletionScope();
  // Folds reset on navigation, because this component does.
  const openShelves = $state<Record<Shelf, boolean>>({
    completed: false,
    notNow: false,
    todo: true,
  });

  // Everything's two copies drop the page-level headings, except Not now in the outstanding copy.
  function hasHeading(shelf: Shelf): boolean {
    if (!completionScope) return true;
    return !completionScope.completed && shelf === "notNow";
  }

  // One keyed list, not several, so a section changing shelves is moved rather than remounted and
  // keeps its expansion & rendered rows.
  let entries = $derived.by((): Entry[] => {
    // A lone section has nothing to be grouped apart from.
    if (items.length < 2) {
      return items.map((item) => ({ closed: false, item, key: getKey(item), kind: "section" }));
    }
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- A scratch index, rebuilt per run.
    const shelved = new Map<Shelf | undefined, Item[]>();
    for (const item of items) {
      const shelf = grouping.shelfOf(getKey(item));
      shelved.set(shelf, [...(shelved.get(shelf) ?? []), item]);
    }
    const shelfEntries = SHELVES.flatMap((shelf): Entry[] => {
      const members = shelved.get(shelf) ?? [];
      if (members.length === 0) return [];
      const heading = hasHeading(shelf);
      const closed = heading && !openShelves[shelf] && !forceOpen;
      return [
        ...(heading ? [{ count: members.length, key: shelf, kind: "heading" as const }] : []),
        ...members.map((item) => ({ closed, item, key: getKey(item), kind: "section" as const })),
      ];
    });
    // Sections on no shelf render nothing, but stay mounted so they can report one later.
    const unshelved = (shelved.get(undefined) ?? []).map((item) => ({
      closed: false,
      item,
      key: getKey(item),
      kind: "section" as const,
    }));
    return [...shelfEntries, ...unshelved];
  });

  // Moving a node blurs whatever it contains, so focus inside a moved section is put back.
  let focusBeforeMove: Element | null = null;

  $effect.pre(() => {
    void entries;
    focusBeforeMove = document.activeElement;
  });

  $effect(() => {
    void entries;
    const target = focusBeforeMove;
    focusBeforeMove = null;
    if (
      target instanceof HTMLElement &&
      target.isConnected &&
      (document.activeElement === null || document.activeElement === document.body)
    ) {
      target.focus({ preventScroll: true });
    }
  });
</script>

{#each entries as entry (entry.key)}
  {#if entry.kind === "heading"}
    {#if entry.key === "todo"}
      <ShelfHeading class="px-2" shelf="todo" />
    {:else}
      <ShelfHeading
        class="px-2"
        count={entry.count}
        expanded={openShelves[entry.key] || forceOpen}
        onToggle={() => {
          openShelves[entry.key] = !openShelves[entry.key];
        }}
        shelf={entry.key}
      />
    {/if}
  {:else}
    <SectionGroupItem closed={entry.closed} {grouping} key={entry.key}>
      {@render section(entry.item)}
    </SectionGroupItem>
  {/if}
{/each}

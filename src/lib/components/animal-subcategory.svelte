<script lang="ts" generics="ItemId extends AnyId">
  import ExpandableSection from "$lib/components/expandable-section.svelte";
  import SpoilerSection from "$lib/components/spoiler-section.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
  import { showUndoToast } from "$lib/utils/undo-toast.js";

  import TrackerRow, { type TrackerRowDisplay } from "./tracker-row.svelte";

  import type { AnimalId, AnyId } from "$lib/types/tracker-data.js";

  import type {
    AnimalSubcategoryProps,
    AnimalSubcategoryRowProps,
  } from "./animal-subcategory.types";

  function rowDisplay(row: AnimalSubcategoryRowProps<ItemId>): TrackerRowDisplay {
    if (row.completed) return { mode: "completed" };
    if (row.redacted) return { mode: "spoilered" };
    return { mode: "visible" };
  }

  let props: AnimalSubcategoryProps<ItemId> = $props();

  let animals = $derived(
    Object.entries(trackerData.animals)
      .map(([id, animal]) => ({ id: id as AnimalId, name: animal.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  let { completedCount, totalCount } = $derived(
    animals.reduce(
      (acc, a) => {
        const { displayableCompletedItemCount, displayableItemCount } = props.sectionConfig(a.id);
        return {
          completedCount: acc.completedCount + displayableCompletedItemCount,
          totalCount: acc.totalCount + displayableItemCount,
        };
      },
      { completedCount: 0, totalCount: 0 },
    ),
  );
</script>

{#if animals.some((a) => props.hasDisplayableItem(a.id))}
  <ExpandableSection count={completedCount} name={props.name} total={totalCount}>
    {#each animals as animal (animal.id)}
      {@const { displayableCompletedItemCount, displayableItemCount, isVisible, visibleItems } =
        props.sectionConfig(animal.id)}
      {#if displayableItemCount > 0}
        <SpoilerSection revealed={isVisible}>
          {#if visibleItems.length > 0}
            <ExpandableSection
              count={displayableCompletedItemCount}
              name={animal.name}
              total={displayableItemCount}
            >
              {#each visibleItems as itemRow (itemRow.id)}
                <TrackerRow
                  display={rowDisplay(itemRow)}
                  lookups={props.lookups
                    ? { ...props.lookups, entityVisibility: undefined }
                    : undefined}
                  name={itemRow.name}
                  subtitle={itemRow.subtitle}
                  onToggle={() => {
                    props.toggleCompletion(animal.id, itemRow.id);
                    const completed = props.completionCheck(animal.id, itemRow.id);
                    showUndoToast(itemRow.name, completed, () => {
                      props.toggleCompletion(animal.id, itemRow.id);
                    });
                    if (completed) {
                      if (props.areAllAnimalsComplete()) {
                        celebrateCategory();
                      } else if (props.isAnimalComplete(animal.id)) {
                        celebrate();
                      }
                    }
                  }}
                  sources={itemRow.sources}
                />
              {/each}
            </ExpandableSection>
          {/if}
        </SpoilerSection>
      {/if}
    {/each}
  </ExpandableSection>
{/if}

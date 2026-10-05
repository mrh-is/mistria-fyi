<script lang="ts" generics="ItemId extends AnyId">
  import ExpandableSection from "#lib/components/expandable-section.svelte";
  import SpoilerSection from "#lib/components/spoiler-section.svelte";
  import { trackerData } from "#lib/data/index.js";
  import { animalNameId, getName, nameCollator } from "#lib/data/names.js";
  import * as m from "#lib/paraglide/messages.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { celebrate, celebrateCategory } from "#lib/utils/celebrate.js";
  import { showUndoToast } from "#lib/utils/undo-toast.js";

  import TrackerRowStack from "./tracker-row-stack.svelte";
  import TrackerRow from './tracker-row.svelte';
import type { TrackerRowDisplay } from './tracker-row.svelte';

  import type { AnimalId, AnyId } from "#lib/types/tracker-data.js";

  import type {
    AnimalSubcategoryProps,
    AnimalSubcategoryRowProps,
  } from "./animal-subcategory.types.js";

  function rowDisplay(row: AnimalSubcategoryRowProps<ItemId>): TrackerRowDisplay {
    if (row.completed) return { mode: "completed" };
    if (row.redacted) return { mode: "spoilered" };
    return { mode: "visible" };
  }

  let props: AnimalSubcategoryProps<ItemId> = $props();

  let animals = $derived(
    Object.entries(trackerData.animals)
      .map(([id]) => ({
        id: id as AnimalId,
        name: getName("animals", animalNameId(id as AnimalId, "core"), props.locale),
      }))
      .toSorted((a, b) => nameCollator(props.locale).compare(a.name, b.name)),
  );

  let { completedCount, totalCount } = $derived.by(() => {
    let completed = 0;
    let total = 0;
    for (const a of animals) {
      const { displayableCompletedItemCount, displayableItemCount } = props.sectionConfig(a.id);
      completed += displayableCompletedItemCount;
      total += displayableItemCount;
    }
    return { completedCount: completed, totalCount: total };
  });
</script>

{#if animals.some((a) => props.hasDisplayableItem(a.id))}
  <ExpandableSection
    count={completedCount}
    name={props.name}
    reportCategory={props.name.toLowerCase()}
    total={totalCount}
  >
    {#each animals as animal (animal.id)}
      {@const { displayableCompletedItemCount, displayableItemCount, isVisible, visibleItems } =
        props.sectionConfig(animal.id)}
      {#if displayableItemCount > 0}
        <SpoilerSection name={animal.name} revealed={isVisible}>
          {#if visibleItems.length > 0}
            <ExpandableSection
              depth={1}
              count={displayableCompletedItemCount}
              name={animal.name}
              reportCategory={props.name.toLowerCase()}
              reportEntityId={animal.id}
              total={displayableItemCount}
            >
              <TrackerRowStack>
                {#each visibleItems as itemRow (itemRow.id)}
                  <TrackerRow
                    display={rowDisplay(itemRow)}
                    lookups={props.lookups
                      ? { ...props.lookups, entityVisibility: undefined }
                      : undefined}
                    name={itemRow.name}
                    reportCategory={props.name.toLowerCase()}
                    reportEntityId={`${animal.id}:${itemRow.id}`}
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
              </TrackerRowStack>
            </ExpandableSection>
          {/if}
        </SpoilerSection>
      {/if}
    {/each}
  </ExpandableSection>
{:else if toolbarState.sourceFilterActive}
  <p class="py-4 text-center text-sm text-muted-foreground">{m.no_items_match_filters()}</p>
{/if}

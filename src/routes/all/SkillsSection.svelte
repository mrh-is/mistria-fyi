<script lang="ts">
  import Stepper from "$lib/components/stepper.svelte";
  import { trackerData } from "$lib/data/index.js";
  import { type CategoryProgress, MAX_SKILL_LEVEL } from "$lib/engine/progress.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { recordEntries, recordKeys } from "$lib/utils";
  import { celebrateCategory } from "$lib/utils/celebrate.js";

  import SectionHeader from "./SectionHeader.svelte";

  import type { SkillId } from "$lib/types/tracker-data.js";

  function areAllSkillsMaxed(): boolean {
    return recordKeys(trackerData.skills).every(
      (id) => (userState.state.completed.skillLevels[id] ?? 0) >= MAX_SKILL_LEVEL,
    );
  }

  function setLevelWithCelebration(skillId: SkillId, newLevel: number): void {
    const wasDone = areAllSkillsMaxed();
    userState.setSkillLevel(skillId, newLevel);
    if (!wasDone && areAllSkillsMaxed()) {
      celebrateCategory();
    }
  }

  const { progress }: { progress: CategoryProgress } = $props();

  let skills = $derived(
    recordEntries(trackerData.skills)
      .map(([id, { name }]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
</script>

{#if progress.completed < progress.total || userState.state.showCompleted}
  <section aria-labelledby="category-skills" class="flex flex-col gap-1">
    <SectionHeader key="skills" {progress} />
    <div class="flex flex-col gap-1">
      {#each skills as skill (skill.id)}
        {@const level = userState.state.completed.skillLevels[skill.id] ?? 0}
        {@const maxed = level >= MAX_SKILL_LEVEL}
        {#if maxed ? userState.state.showCompleted : true}
          <div class="flex items-center gap-2 rounded-md px-2 {maxed ? 'opacity-40' : ''}">
            <span class="min-w-0 flex-1 text-base font-medium">{skill.name}</span>
            <div class="w-32 shrink-0">
              <Stepper
                decrementDisabled={level <= 0}
                incrementDisabled={level >= MAX_SKILL_LEVEL}
                decrementLabel="Decrease {skill.name} level"
                incrementLabel="Increase {skill.name} level"
                onDecrement={() => {
                  setLevelWithCelebration(skill.id, level - 1);
                }}
                onIncrement={() => {
                  setLevelWithCelebration(skill.id, level + 1);
                }}
              >
                <span class="text-sm text-muted-foreground tabular-nums"
                  >{level}/{MAX_SKILL_LEVEL}</span
                >
              </Stepper>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </section>
{/if}

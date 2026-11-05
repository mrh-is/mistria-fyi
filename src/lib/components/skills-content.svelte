<script lang="ts">
  import CompletionSection from "#lib/components/completion-section.svelte";
  import ShelfGroups from "#lib/components/shelf-groups.svelte";
  import SkillRecord from "#lib/components/skill-record.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
  import { trackerData } from "#lib/data/index.js";
  import { getName, nameCollator } from "#lib/data/names.js";
  import { isSkillComplete } from "#lib/engine/projections/skills.js";
  import * as m from "#lib/paraglide/messages.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { recordKeys } from "#lib/utils/record.js";

  import type { LocaleCode } from "#lib/types/locale.js";
  import type { SkillId } from "#lib/types/tracker-data.js";

  let { compact = false, locale }: { compact?: boolean; locale: LocaleCode } = $props();

  const spoilerGuard = createSpoilerGuard();

  let skills = $derived.by(() => {
    const collator = nameCollator(locale);
    return recordKeys(trackerData.skills)
      .map((id) => ({ id, name: getName("skills", id, locale) }))
      .filter(({ name }) => matchesName(name, toolbarState.searchQuery, locale))
      .toSorted((a, b) => collator.compare(a.name, b.name));
  });

  registerPageSearch(() => ({
    filtered: { completed: 0, notNow: 0, todo: 0 },
    visible: skills.length,
  }));
</script>

{#snippet ledger(rows: readonly { id: SkillId; name: string }[])}
  <ul class="skill-ledger" aria-label={m.skills_ledger_aria()}>
    {#each rows as skill (skill.id)}
      <CompletionSection complete={isSkillComplete(skill.id, userState.state.progress)}>
        <SkillRecord {compact} id={skill.id} {locale} name={skill.name} {spoilerGuard} />
      </CompletionSection>
    {/each}
  </ul>
{/snippet}

{#if compact}
  {@render ledger(skills)}
{:else}
  <ShelfGroups
    forceOpen={!!toolbarState.searchQuery}
    getKey={(skill) => skill.id}
    getShelf={(skill) =>
      isSkillComplete(skill.id, userState.state.progress) ? "completed" : "todo"}
    group={ledger}
    items={skills}
  />
{/if}

<SpoilerGuardDialog guard={spoilerGuard} />

<style>
  .skill-ledger {
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>

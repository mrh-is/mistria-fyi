<script lang="ts">
  import CompletionSection from "#lib/components/completion-section.svelte";
  import LedgerIndex from "#lib/components/ledger/ledger-index.svelte";
  import SkillRecord from "#lib/components/skill-record.svelte";
  import { registerPageSearch } from "#lib/controllers/page-search.svelte.js";
  import { trackerData } from "#lib/data/index.js";
  import { getName } from "#lib/data/names.js";
  import { isSkillComplete } from "#lib/engine/projections/skills.js";
  import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
  import { userState } from "#lib/stores/user-state.svelte.js";
  import { matchesName } from "#lib/utils/name-match.js";
  import { recordKeys } from "#lib/utils/record.js";

  import type { LocaleCode } from "#lib/types/locale.js";

  let { compact = false, locale }: { compact?: boolean; locale: LocaleCode } = $props();

  let entries = $derived(
    recordKeys(trackerData.skills).map((skillId) => {
      const name = getName("skills", skillId, locale);
      return {
        id: `skill-${skillId}`,
        meterLevel: userState.state.progress.skillLevels[skillId] ?? 0,
        muted: !matchesName(name, toolbarState.searchQuery, locale),
        name,
        skillId,
      };
    }),
  );
  let skills = $derived(entries.filter(({ muted }) => !muted));

  registerPageSearch(() => ({
    filtered: { completed: 0, notNow: 0, todo: 0 },
    visible: skills.length,
  }));
</script>

{#snippet ledger()}
  <ul class="skill-ledger" aria-label="Skills ledger">
    {#each skills as skill (skill.id)}
      {#if compact}
        <CompletionSection complete={isSkillComplete(skill.skillId, userState.state.progress)}>
          <SkillRecord {compact} id={skill.skillId} {locale} name={skill.name} />
        </CompletionSection>
      {:else}
        <SkillRecord anchor={skill.id} id={skill.skillId} {locale} name={skill.name} />
      {/if}
    {/each}
  </ul>
{/snippet}

{#if compact}
  {@render ledger()}
{:else}
  <LedgerIndex sections={entries}>
    {@render ledger()}
  </LedgerIndex>
{/if}

<style>
  .skill-ledger {
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>

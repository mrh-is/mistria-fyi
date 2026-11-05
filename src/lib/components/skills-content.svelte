<script lang="ts">
  import CompletionSection from "#lib/components/completion-section.svelte";
  import SkillRecord from "#lib/components/skill-record.svelte";
  import SpoilerGuardDialog from "#lib/components/spoiler-guard-dialog.svelte";
  import { registerPageSearch, showsCompletedRows } from "#lib/controllers/page-search.svelte.js";
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

  function isVisible(id: SkillId): boolean {
    return !isSkillComplete(id, userState.state.progress) || showsCompletedRows();
  }

  registerPageSearch(() => ({
    matches: skills.length,
    visible: skills.filter(({ id }) => isVisible(id)).length,
  }));
</script>

<ul class="skill-ledger" aria-label={m.skills_ledger_aria()}>
  {#each skills as skill (skill.id)}
    <CompletionSection complete={isSkillComplete(skill.id, userState.state.progress)}>
      {#if isVisible(skill.id)}
        <SkillRecord {compact} id={skill.id} {locale} name={skill.name} {spoilerGuard} />
      {/if}
    </CompletionSection>
  {/each}
</ul>

<SpoilerGuardDialog guard={spoilerGuard} />

<style>
  .skill-ledger {
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>

<script lang="ts">
  import SkillsContent from "$lib/components/skills-content.svelte";

  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();
</script>

<SkillsContent locale={data.locale} />

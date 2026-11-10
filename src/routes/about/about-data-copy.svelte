<script lang="ts">
  let { version }: { version: string } = $props();
</script>

<!-- eslint-disable local/no-hardcoded-ui-text -- Wuchale extracts the authored copy in this component. -->
<section>
  <h2>Data</h2>
  <p>
    Fields of Mistria (the game) & all the content therein, including data & images, remain
    properties of NPC Studio & their respective rightsholders.
  </p>
  <p>
    {`The current guide data was generated based on game version ${version}. When there’s a game update, this guide will briefly be out of date while I update everything.`}
  </p>
</section>
<!-- eslint-enable local/no-hardcoded-ui-text -->

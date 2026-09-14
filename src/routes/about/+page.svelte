<script lang="ts">
  import PageHeader from "$lib/components/page-header.svelte";
</script>

<svelte:head>
  <title>About this guide — Mistria Field Guide</title>
  <meta
    name="description"
    content="The Mistria Field Guide’s unofficial status, ownership boundaries, and data policy."
  />
</svelte:head>

<PageHeader title="About this guide" backHref="/data" backLabel="Back to data management" />

<div class="about-page">
  <section>
    <h2>Project status</h2>
    <p>
      Mistria Field Guide is an independent, unofficial, noncommercial fan project maintained by
      Michael Helmbrecht. It is not affiliated with, endorsed by, supported by, or sponsored by
      <a href="https://www.npcstudio.com/">NPC Studio</a>.
    </p>
    <p>
      The guide has no advertising, subscriptions, paid features, or donations. It exists to help
      players track their own progress in
      <a href="https://www.fieldsofmistria.com/">Fields of Mistria</a>.
    </p>
  </section>

  <div class="divider"></div>

  <section>
    <h2>What I made</h2>
    <p>
      I claim authorship of the guide’s original code, interface, organization, and editorial work,
      together with contributions made by this project’s contributors.
    </p>
  </section>

  <div class="divider"></div>

  <section>
    <h2>What I don’t claim</h2>
    <p>
      This project does not claim ownership of Fields of Mistria or its names, marks, characters,
      artwork, sprites, or other game-derived material. Those materials belong to NPC Studio and
      their respective rights holders. Their presence does not imply that NPC Studio has licensed,
      approved, or endorsed this project.
    </p>
  </section>

  <div class="divider"></div>

  <section>
    <h2>Data & accuracy</h2>
    <p>
      Tracker data is generated for the game version shown on the data management page. It may be
      incomplete, inaccurate, or outdated after a game update. The game itself remains the
      authoritative source.
    </p>
    <p>
      Original game data files are not distributed. The deployed guide currently includes a
      generated factual dataset and selected extracted icons needed to identify tracked items.
    </p>
  </section>

  <div class="divider"></div>

  <section>
    <h2>Questions & requests</h2>
    <p>
      Players can report mistakes through “Send feedback” in the tracker. Rights holders can
      <a href="mailto:me@mrh.is">contact me privately</a> to request review, correction, modification,
      or removal of material.
    </p>
  </section>
</div>

<style>
  .about-page {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 16px 16px 28px;
    font-size: 14px;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  h2 {
    color: var(--ink-muted);
    font-family: var(--font-controls);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  p {
    line-height: 1.6;
  }

  a {
    color: var(--ink);
    text-decoration: underline;
    text-decoration-color: var(--primary);
    text-decoration-style: dotted;
    text-underline-offset: 3px;
  }

  a:is(:hover, :focus-visible) {
    text-decoration-style: solid;
  }

  .divider {
    border-top: 1px solid color-mix(in srgb, var(--hairline) 50%, transparent);
  }
</style>

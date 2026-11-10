<script lang="ts">
  import PageHeader from "#lib/components/page-header.svelte";
  import { messageParts } from "#lib/utils/message-parts.js";
  import { browser } from "$app/env";
  import { page } from "$app/state";

  const from = $derived(browser ? page.url.searchParams.get("from") : null);
  const source = $derived(from === "about" || from === "data" ? from : undefined);

  /** Bump this whenever the policy's meaning changes. */
  const LAST_UPDATED = Date.UTC(2026, 10, 5);

  const lastUpdated = $derived(
    new Intl.DateTimeFormat(page.data.locale, { dateStyle: "long", timeZone: "UTC" }).format(
      LAST_UPDATED,
    ),
  );
</script>

{#snippet sectionHeading(text: string)}
  <h3 class="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
    {text}
  </h3>
{/snippet}

<PageHeader
  title="Privacy policy"
  backHref={source}
  backLabel={source === undefined ? undefined : "Go back"}
/>

<div class="flex flex-col gap-6 p-4 text-sm">
  <p class="text-muted-foreground">{`Last updated ${lastUpdated}`}</p>

  <h2 class="text-lg font-semibold">Without sync</h2>

  <section class="flex flex-col gap-2">
    {@render sectionHeading("The short version")}
    <p>
      The Mistria Field Guide stores your data on your device only. Nothing is collected
      automatically or shared without your action. If you choose to send feedback, see below for
      what that includes. Anything you send is used only to fix the app. Apart from the public issue
      described below, it isn’t shared with anyone, and it’s never used to optimize engagement.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading("What is stored on your device")}
    <p>
      To remember your progress, the Mistria Field Guide saves your game data (completed items,
      settings, and world state) in your browser’s local storage. This data never leaves your device
      unless you explicitly choose to send it.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading("Feedback submissions")}
    <p>
      The Mistria Field Guide includes an optional feedback feature. When you submit feedback, the
      following is sent to the server:
    </p>
    <ul class="ml-4 list-disc space-y-1">
      <li>Your message text.</li>
      <li>The app version and game data version (for debugging context).</li>
      <li>If you pick a specific item, its name, category, and page (no personal information).</li>
      <li>
        Your tracked progress data (items checked off, skill levels, etc.), only if you opt in.
      </li>
      <li>
        Your save file sync log, only if you opt in: recent sync activity from the tab you send it
        from, including your game version and any game IDs we didn’t recognize. It leaves out your
        character and farm names, your code and sync links, and your exact farm number, which gets
        hashed.
      </li>
      <li>Your email address, if you choose to provide one.</li>
    </ul>
    <p>
      Your feedback (minus your email) is used to create a <strong>public issue</strong>
      <!-- @wc-include -->on the GitHub issue tracker so I can find and fix problems. This includes
      your message, the item you picked (if any), your progress data (if you opted in), and your
      save file sync log (if you opted in). Avoid including personal information in your message, as
      these fields will be
      <strong>publicly visible</strong>.
    </p>
    <p>
      If you provide an email address, it is stored privately in a separate system and never appears
      in the public issue. It is used only to follow up on your feedback if needed, and it’s deleted
      automatically after 90 days.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading("Abuse prevention")}
    <p>
      The feedback endpoint may use Cloudflare’s built-in rate limiting or other abuse-prevention
      measures, which process IP addresses transiently at the network edge. IP addresses are not
      read, logged, or stored by the application.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading("Third-party services")}
    <p>
      The Mistria Field Guide does not use any analytics, advertising, or tracking services. The
      feedback feature uses GitHub (for public issue tracking) and Cloudflare (for hosting and rate
      limiting).
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading("AI in development")}
    <p>
      The Mistria Field Guide is built with the help of AI coding tools that assist with writing &
      reviewing code. These tools work with the project’s source code & with public feedback issues.
      A feedback issue holds your message, plus your game progress & save file sync log if you opt
      in to attaching them. AI tools never get your email address. Beyond what you choose to send as
      feedback, they don’t see how you use the app.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <h2 class="text-lg font-semibold">With sync</h2>
  <p>
    Syncing your save file is opt-in, so none of this happens unless you set it up. If you do,
    here’s what changes. Everything under “Without sync” still applies to the rest of your data.
  </p>

  <section class="flex flex-col gap-2">
    {@render sectionHeading("What gets synced")}
    <p>
      Only the game’s save file gets synced. Anything you check off by hand stays on that device.
      Your save file is end-to-end encrypted before it leaves your gaming computer, so only devices
      with your code can read it. We can’t read it, and neither can the server that passes it along.
    </p>
    <p>
      If you send feedback, you can choose to attach your save file sync log, and that log is
      public. “Feedback submissions” above says what’s in it.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading("How long we keep it")}
    <p>
      The server keeps only the latest save file for each code, and deletes it 30 days after it was
      sent. It also keeps a small record for each code, with no save data in it: when the code was
      made and last used, how many save files were sent that day, a number that keeps save files in
      order, and one-way fingerprints that prove your computer owns the code and spot a repeat of
      the same save file. That record isn’t encrypted. It goes away when you make a new code, or a
      year after your last save file, leaving only a marker so the code never gets reused. When
      something on the server breaks, it counts what kind of problem it was each day, like the bot
      check not answering, and keeps those counts for two weeks. They hold nothing about you or what
      you sent. One catch: Cloudflare, who hosts that server, keeps a recovery copy of its storage
      for 30 days, so a replaced or deleted save file can stay recoverable for up to 30 more days,
      still encrypted.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading("Your code")}
    <p>
      Anyone holding your code can read the save files you share, until that code stops working.
      Treat it like a password, and it’s worth keeping off stream. If it ever gets out, make a new
      code. The old one takes a moment to turn off, and Data shows you until it’s done.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading("IP addresses")}
    <p>
      Cloudflare processes IP addresses to deliver your save file and to limit how often one address
      can ask for it, and we don’t log them. We also limit how many new codes can come from one
      address, without saving the address in our storage. All we keep is a count in an hourly bucket
      shared with lots of other addresses, so it can’t point back to you. Those counts can stay in
      Cloudflare’s recovery copy for 30 days too.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading("No account")}
    <p>
      There’s no account, no sign-in, and no email address. Your code is the only thing connecting
      your devices.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading("Bot check")}
    <p>
      {#each messageParts((slot) => `When you make a new code, Cloudflare Turnstile checks that you’re not a bot, with nothing for you to solve. That check is covered by Cloudflare’s ${slot("addendum")}.`) as part, index (index)}
        {#if typeof part === "string"}{part}{:else}<a
            class="underline"
            href="https://www.cloudflare.com/turnstile-privacy-policy/"
            >Turnstile Privacy Addendum</a
          >{/if}
      {/each}
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    {@render sectionHeading("What you’re trusting")}
    <p>
      Encryption protects the save file the server stores. It can’t protect your code from the app
      itself, though. Your code lives in this app’s storage on your device, so you’re trusting the
      app your browser gets from us. That includes the Cloudflare Turnstile script, which runs right
      alongside the app once you make a new code or open the feedback form. Cloudflare already
      delivers the whole app, so that’s not a new party to trust.
    </p>
  </section>

  <div class="border-t border-border/50"></div>

  <section class="flex flex-col gap-2">
    <h2 class="text-lg font-semibold">Changes</h2>
    <p>If this policy ever changes, I will update this page.</p>
  </section>
</div>

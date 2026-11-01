# Save import verification

The real-save suite can compare imports with facts a player checks in Fields of Mistria. These
checks extend `src/lib/engine/import-save.assets.test.ts`; they use its existing parser & importer.

## Current coverage

`src/lib/engine/import-save.observations.ts` records the exact private save references, game
versions, & SHA-256 digests. Its observations remain independent of the importer & the tracker’s
current game version.

| Private save reference                                    | Game version | Mine floor | Museum  | Spouse                           |
| --------------------------------------------------------- | ------------ | ---------- | ------- | -------------------------------- |
| `pipeline/input/v1.0.8/save/game-1315159680-autosave.sav` | 1.0.8        | Pending    | Pending | Ryis, owner’s report, 2026-11-01 |
| `pipeline/input/v1.0.8/save/game-1720221376-autosave.sav` | 1.0.8        | Pending    | Pending | Pending                          |

The owner reported being married to Ryis in their actively played farm on 2026-11-01, before the
importer comparison. They then refreshed the late-game autosave & identified it as that farm’s
current save. The confirmed spouse expectation records this player report; no screenshot was
supplied.

The other five observations remain pending, with no expected value or verification source; Vitest
reports their checks as skipped. The existing save-derived assertions remain useful structural
coverage, but they do not establish independent game confirmation.

## Player checklist

1. Choose one exact snapshot from the table. Preserve the original private file & use a separate
   copy to open it in the game. Do not overwrite your current saves. A newer autosave of the same
   farm may contain different progress.
2. Record the game version used to inspect the copy. If the game upgrades an older save, record both
   versions & any conversion; do not treat the upgraded copy as a newly verified original without
   checking whether the observed fact changed.
3. Check one or more facts in the game before comparing them with the importer. Record what you see,
   including an explicit absence where relevant.
   - For mines, record the deepest reached floor the game displays. If the elevator shows only
     unlocked stops, record that limitation & leave the exact deepest floor pending.
   - For the museum, name at least one item & whether it has been donated. Check the donation
     status, not whether the item is in your inventory. A few named items are sufficient; an entire
     museum inventory is unnecessary.
   - For a spouse, record the spouse’s name, or explicitly confirm that the character is unmarried.
     Dating or engagement does not count as marriage.
4. Record who checked the fact, the observation date, & its evidence. A player’s written report is
   sufficient; a screenshot can support it. Identify the exact snapshot being checked, including its
   digest. Keep any private evidence private, & publish only a reference or summary the contributor
   permits.
5. Update only the corresponding observation in `import-save.observations.ts`. Set `status` to
   “confirmed”, fill in `value`, & supply `source.observer`, `source.observedOn` (`YYYY-MM-DD`), &
   `source.evidence`. The evidence describes the game screen or player report, the game version
   used, & how the checked copy was matched to the original snapshot. Use canonical item or villager
   IDs when translating observed names; never infer donation or marriage from the importer.
6. Run the focused suite below. A mismatch requires investigation; do not replace the observed value
   with the importer’s answer. Leave unrelated observations pending, & update the coverage table
   above.

For museum observations, `value.donated` & `value.notDonated` list only the items actually checked.
At least one list must be nonempty. For spouse observations, `value: null` means a confirmed absence
of a spouse; `status: “pending”` means nobody has checked.

## Run the checks

The worktree needs the private saves under `pipeline/input/v<version>/save/`, linked by normal
worktree setup. No save upload, game asset extraction, or importer change is required.

```sh
pnpm exec vitest run src/lib/engine/import-save.assets.test.ts
```

The suite always checks the snapshot digest & its writing game version. It compares imported facts
only for confirmed observations. Missing snapshots & changed bytes fail rather than silently
dropping coverage. CI has no private saves, so this remains a local asset test.

## Privacy & updates

Permission to use a save for testing is separate from permission to publish it. Keep raw saves,
unpacked saves, identifying details, & unapproved screenshots out of Git & public attachments. The
committed records contain only save references, digests, & approved observations.

When a player supplies a new snapshot for a confirmed observation, retain the old snapshot &
observation record. Add a separately identified record with its own writing version & digest. A
pending record can be replaced before any observation is confirmed; it carries no verified
expectations forward. Updating the importer or tracker data must never regenerate game observations.
Replacing a file under an existing autosave name will fail its digest check; restore the original
private snapshot before reusing its expectations.

## Remaining checks

Mine floor & museum observations remain pending for both snapshots. The early-game snapshot also
needs a spouse observation, including an explicit confirmation if the character is unmarried. No
friends’ saves or contribution permissions have been received for this work. Coverage of other
progress states depends on separately supplied saves & independent checks; the current records make
no claim about those states.

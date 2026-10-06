# Panel keyboard focus

## Context

Toolbar foldouts & feedback used different Tab traps, and toolbar Escape handling duplicated the
foldout handler (#445).

## Decision

Use one Svelte attachment for keyboard containment & Escape, and a shared overlay component for the
scrim & positioned wrapper. Callers choose initial focus & restoration policy through the overlay’s
optional focus attachment. #446 revisits the initial implementation because DOM attachment cleanup
replaces previous-value effects while retaining picker suspension & nested-dialog behavior. A stack
limits nested attachments to the innermost panel; prevented events remain owned by bits-ui dialogs.

## Alternatives

Replacing the panels with bits-ui Dialog would also provide containment, but would broaden the
change into positioning, transition, & focus lifecycle behavior. Keep existing bits-ui consumers as
they are.

## Revisit if

The panels adopt the existing bits-ui dialog presentation, or another consumer needs a shared
initial-focus & restoration policy instead of caller-specific lifecycle attachments.

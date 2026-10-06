/** A run of literal text, or the position a named placeholder landed in. */
export type MessagePart<Slot extends string = string> = string | { slot: Slot };

const SLOT_OPEN = "";
const SLOT_CLOSE = "";
const SLOT_PATTERN = /([^]*)/u;

/**
 * Renders a localized message whose placeholders hold markup (a link, an icon) rather than text.
 * `render` receives a `slot` function that swaps a name for a private-use marker, so it passes the
 * markers into the message (`m.about_maintainer({ studio: slot("studio") })`); the rendered string
 * is split back apart at the markers, and each locale's word order decides where the slots land.
 * A message that drops a placeholder throws, since a silently missing link is a translation bug.
 */
export function messageParts<Slot extends string>(
  render: (slot: (name: Slot) => string) => string,
): MessagePart<Slot>[] {
  const requested = new Set<Slot>();
  const text = render((name) => {
    requested.add(name);
    return `${SLOT_OPEN}${name}${SLOT_CLOSE}`;
  });

  const used = new Set<string>();
  const parts: MessagePart<Slot>[] = [];
  const pieces = text.split(SLOT_PATTERN);
  for (const [index, piece] of pieces.entries()) {
    if (index % 2 === 1) {
      used.add(piece);
      parts.push({ slot: piece as Slot });
    } else if (piece !== "") {
      parts.push(piece);
    }
  }

  const dropped = [...requested].filter((name) => !used.has(name));
  if (dropped.length > 0) {
    throw new Error(
      `Message dropped placeholder(s) ${dropped.join(", ")}: ${JSON.stringify(text)}`,
    );
  }
  return parts;
}

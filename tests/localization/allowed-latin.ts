interface AllowedLatin {
  paths?: readonly string[];
  reason: string;
  text: string;
}

const allowedLatin: readonly AllowedLatin[] = [
  { reason: "Game title", text: "Fields of Mistria" },
  { reason: "Product name", text: "Mistria Field Guide" },
  { reason: "Game studio name", text: "NPC Studio" },
  { reason: "Project author", text: "Michael Helmbrecht" },
  { reason: "Project author, referred to by first name in feedback", text: "Michael" },
  { reason: "Service provider name", text: "Cloudflare" },
  { reason: "Bot-check service name", text: "Turnstile" },
  { reason: "Service provider name", text: "GitHub" },
  { reason: "Artificial intelligence initialism", text: "AI" },
  { reason: "Identifier initialism", text: "ID" },
  { reason: "Internet Protocol initialism", text: "IP" },
  { paths: ["/ja/renown"], reason: "Japanese UI abbreviation for level", text: "Lv" },
  {
    paths: ["/ja/almanac", "/ja/everything"],
    reason: "The Japanese game UI name table retains the English name",
    text: "Song Crystals",
  },
  {
    paths: ["/ja/privacy", "/ja"],
    reason: "Known privacy and feedback translation gap (#746)",
    text: "Issue",
  },
  {
    paths: ["/ru/privacy", "/ru"],
    reason: "Known privacy and feedback translation gap (#746)",
    text: "email",
  },
];

const latinLetter = String.raw`[\p{Script=Latin}&&\p{Letter}]`;
const latinRun = new RegExp(`${latinLetter}{2,}`, "v");

export function findUnexpectedLatin(
  path: string,
  buildVersion?: string,
): (text: string) => boolean {
  const allowed = allowedLatin.filter(({ paths }) => paths === undefined || paths.includes(path));
  if (buildVersion !== undefined && (path === "/ja/data" || path === "/ru/data")) {
    allowed.push({
      reason: "Short product name and exact version from this build's manifest",
      text: `Field Guide v${buildVersion}`,
    });
  }
  // Match literal phrases bounded by non-Latin characters, including adjacent Japanese text.
  // Keep the longest first so a short name cannot consume part of a longer name.
  const alternatives = allowed
    .toSorted((left, right) => right.text.length - left.text.length)
    .map(({ text }) => RegExp.escape(text))
    .join("|");
  const literal = new RegExp(`(?<!${latinLetter})(?:${alternatives})(?!${latinLetter})`, "gv");
  return (text) => latinRun.test(text.replaceAll(literal, " "));
}

import { basename } from "node:path";

import { shellSegments } from "#scripts/lib/agent-hook";

/** Literal shell words, including quoted newlines. Expansions remain literal, never evaluated. */
export function commandWords(command: string): string[] {
  const words: string[] = [];
  let word = "";
  let started = false;
  let quote = "";
  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (char === "\\" && quote !== "'") {
      const next = command[index + 1];
      if (next !== undefined && (quote === "" || /["\\$`\n]/.test(next))) {
        word += next === "\n" ? "" : next;
        index++;
      } else {
        word += char;
      }
      started = true;
    } else if (quote !== "") {
      if (char === quote) quote = "";
      else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) words.push(word);
      word = "";
      started = false;
    } else {
      word += char;
      started = true;
    }
  }
  if (started) words.push(word);
  return words;
}

/** Strip assignments and common wrappers; commands hidden in arbitrary programs aren't parsed. */
export function programWords(command: string): string[] {
  const words = commandWords(command).filter((word) => !/^[(){}]$/.test(word));
  while (
    words.length > 0 &&
    (/^\w+=/.test(words[0]) || /^(?:env|command|exec|sudo)$/.test(words[0]))
  ) {
    words.shift();
  }
  if (words[0]) words[0] = basename(words[0]);
  return words;
}

/** Drop global Git/gh/pnpm flags before looking for their subcommand. */
export function commandArgs(words: string[]): string[] {
  let index = 1;
  const takesValue = new Set([
    "-C",
    "-c",
    "--git-dir",
    "--work-tree",
    "-R",
    "--repo",
    "--hostname",
    "--filter",
    "-F",
    "--dir",
  ]);
  while (words[index]?.startsWith("-")) {
    const option = words[index++];
    if (takesValue.has(option)) index++;
  }
  return words.slice(index);
}

/** Substitutions outside single quotes are commands, including inside double-quoted arguments. */
function commandSubstitutions(command: string): string[] {
  const result: string[] = [];
  let quote = "";
  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (char === "\\" && quote !== "'") {
      index++;
      continue;
    }
    if (char === "'" && quote !== '"') {
      quote = quote === "'" ? "" : "'";
      continue;
    }
    if (char === '"' && quote !== "'") {
      quote = quote === '"' ? "" : '"';
      continue;
    }
    if (quote === "'") continue;
    if (char === "`") {
      let end = index + 1;
      while (end < command.length && command[end] !== "`") {
        if (command[end] === "\\") end++;
        end++;
      }
      result.push(command.slice(index + 1, end));
      index = end;
    } else if (command.startsWith("$(", index) && command[index + 2] !== "(") {
      let depth = 1;
      let innerQuote = "";
      let end = index + 2;
      for (; end < command.length; end++) {
        const inner = command[end];
        if (inner === "\\" && innerQuote !== "'") {
          end++;
          continue;
        }
        if (innerQuote !== "") {
          if (inner === innerQuote) innerQuote = "";
          continue;
        }
        if (inner === "'" || inner === '"') innerQuote = inner;
        else if (inner === "(") depth++;
        else if (inner === ")" && --depth === 0) break;
      }
      result.push(command.slice(index + 2, end));
      index = end;
    }
  }
  return result;
}

/** Shell heredocs are code only when fed to a shell; other heredocs remain associated text. */
export function policySegments(command: string): { command: string; heredoc: string }[] {
  const segments = shellSegments(command);
  const result = segments.map(({ command: text, heredoc }) => ({ command: text, heredoc }));
  for (const [index, segment] of segments.entries()) {
    const words = programWords(segment.command);
    for (const subcommand of commandSubstitutions(segment.command)) {
      result.push(...policySegments(subcommand));
    }
    const shell = /^(?:ba|da|k|z)?sh$/;
    if (shell.test(words[0] ?? "")) {
      const inline = words.findIndex((word) => /^-[a-z]*c[a-z]*$/.test(word));
      if (inline !== -1 && words[inline + 1]) result.push(...policySegments(words[inline + 1]));
    }
    let shellConsumer = shell.test(words[0] ?? "");
    for (let next = index; segments[next].pipe && next + 1 < segments.length; next++) {
      shellConsumer ||= shell.test(programWords(segments[next + 1].command)[0] ?? "");
    }
    if (shellConsumer && segment.heredoc !== "") result.push(...policySegments(segment.heredoc));
    // An unquoted heredoc expands substitutions even when its consumer treats the body as text.
    for (const match of segment.expanding.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)) {
      result.push(...policySegments(match[1] ?? match[2]));
    }
  }
  return result;
}

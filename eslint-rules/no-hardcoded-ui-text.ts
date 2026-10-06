// Flags literal English text in Svelte templates that should go through a Paraglide message
// (`m.someKey()`) instead. Catches UI chrome text only — see docs/localization.md for the
// game-data localization path, which this rule cannot see (it's a plain property access like
// `entity.name`, indistinguishable syntactically from any other field).
//
// Checked: text nodes, string literals in text mustaches (`{"Hello"}`, `{ok ? "Yes" : "No"}`),
// and every static or mustache-literal part of a text attribute (`aria-label="Remove {name}"`).
//
// Verbatim/technical content (<code>, <kbd>, <samp>, <pre>) is exempt: file paths, keyboard keys,
// and code snippets aren't translated. Proper nouns (product names, people's names) still get
// flagged and need an eslint-disable comment — there's no reliable syntactic way to tell "Fields
// of Mistria" apart from ordinary prose.

import type { Rule } from "eslint";
import type { AST } from "svelte-eslint-parser";

type Expression = AST.SvelteMustacheTagText["expression"];

interface Found {
  node: { loc?: AST.SourceLocation | null | undefined };
  text: string;
}

const VERBATIM_ELEMENTS = new Set(["code", "kbd", "pre", "samp"]);

const TEXT_ATTRIBUTES = new Set([
  "alt",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "placeholder",
  "title",
]);

const HAS_LETTER = /\p{L}/u;

function isTranslatable(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && HAS_LETTER.test(trimmed);
}

// Translatable string literals that a mustache expression can render directly: `{"Hello"}`,
// `{cond ? "Yes" : "No"}`, `{value ?? "None"}`, and a template literal's static parts.
function* stringLiterals(expression: Expression): Generator<Found> {
  if (expression.type === "Literal") {
    if (typeof expression.value === "string" && isTranslatable(expression.value)) {
      yield { node: expression, text: expression.value };
    }
  } else if (expression.type === "TemplateLiteral") {
    for (const quasi of expression.quasis) {
      const cooked = quasi.value.cooked ?? "";
      if (isTranslatable(cooked)) {
        yield { node: quasi, text: cooked };
      }
    }
  } else if (expression.type === "ConditionalExpression") {
    yield* stringLiterals(expression.consequent);
    yield* stringLiterals(expression.alternate);
  } else if (expression.type === "LogicalExpression") {
    yield* stringLiterals(expression.left);
    yield* stringLiterals(expression.right);
  }
}

// ESLint's listener types only know ESTree nodes; svelte-eslint-parser adds the Svelte ones.
// Widen first: narrowing an ESTree node to a Svelte node directly yields `never`.
function isSvelteAttribute(node: { type: string }): node is AST.SvelteAttribute {
  return node.type === "SvelteAttribute";
}

function isSvelteMustacheTag(node: { type: string }): node is AST.SvelteMustacheTag {
  return node.type === "SvelteMustacheTag";
}

function isSvelteText(node: { type: string }): node is AST.SvelteText {
  return node.type === "SvelteText";
}

function isAttributeLike(node: { type: string }): boolean {
  return node.type === "SvelteAttribute" || node.type.endsWith("Directive");
}

function isVerbatimAncestor(ancestor: { type: string }): boolean {
  if (ancestor.type === "SvelteScriptElement" || ancestor.type === "SvelteStyleElement") {
    return true;
  }
  const element = ancestor as Partial<AST.SvelteElement>;
  return (
    element.type === "SvelteElement" &&
    element.name?.type === "SvelteName" &&
    VERBATIM_ELEMENTS.has(element.name.name)
  );
}

const rule: Rule.RuleModule = {
  create(context) {
    function isExempt(node: Rule.Node): boolean {
      return context.sourceCode.getAncestors(node).some((ancestor) => isVerbatimAncestor(ancestor));
    }

    return {
      SvelteAttribute(listenerNode: Rule.Node) {
        const node: { type: string } = listenerNode;
        if (!isSvelteAttribute(node)) return;
        const attrName = node.key.name;
        if (typeof attrName !== "string" || !TEXT_ATTRIBUTES.has(attrName)) {
          return;
        }
        // `node.value` is empty for shorthand/boolean attributes; otherwise a mix of static
        // text (`SvelteLiteral`) & `{...}` mustaches, e.g. `aria-label="Remove {name}"`.
        for (const part of node.value) {
          if (part.type === "SvelteLiteral") {
            if (isTranslatable(part.value)) {
              context.report({
                data: { attribute: attrName, text: JSON.stringify(part.value.trim()) },
                loc: part.loc,
                messageId: "hardcodedAttribute",
              });
            }
          } else {
            for (const literal of stringLiterals(part.expression)) {
              context.report({
                data: { attribute: attrName, text: JSON.stringify(literal.text.trim()) },
                loc: literal.node.loc ?? part.loc,
                messageId: "hardcodedAttribute",
              });
            }
          }
        }
      },
      SvelteMustacheTag(listenerNode: Rule.Node) {
        const node: { type: string } = listenerNode;
        // Attribute mustaches are handled by `SvelteAttribute`; directive values are code, not text.
        if (!isSvelteMustacheTag(node) || isAttributeLike(node.parent) || isExempt(listenerNode)) {
          return;
        }
        for (const literal of stringLiterals(node.expression)) {
          context.report({
            data: { text: JSON.stringify(literal.text.trim()) },
            loc: literal.node.loc ?? node.loc,
            messageId: "hardcodedText",
          });
        }
      },
      SvelteText(listenerNode: Rule.Node) {
        const node: { type: string } = listenerNode;
        if (!isSvelteText(node) || isExempt(listenerNode)) {
          return;
        }
        if (isTranslatable(node.value)) {
          context.report({
            data: { text: JSON.stringify(node.value.trim()) },
            loc: node.loc,
            messageId: "hardcodedText",
          });
        }
      },
    };
  },
  meta: {
    type: "problem",
    docs: {
      description: "disallow hardcoded UI text in Svelte templates; use a Paraglide message",
    },
    messages: {
      hardcodedAttribute:
        'Hardcoded UI text {{text}} in "{{attribute}}" — use a Paraglide message (m.someKey()) instead.',
      hardcodedText: "Hardcoded UI text {{text}} — use a Paraglide message (m.someKey()) instead.",
    },
    schema: [],
  },
};

export default rule;

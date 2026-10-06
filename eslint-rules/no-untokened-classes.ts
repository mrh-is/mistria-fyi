// Keep app-authored Tailwind classes on the design tokens in src/app.css. This rule inspects
// Svelte class attributes (including expressions) and class: directives, where Stylelint cannot.

import type { Rule } from "eslint";
import type { AST } from "svelte-eslint-parser";

type Expression = AST.SvelteMustacheTagText["expression"];

interface ClassText {
  loc: AST.SourceLocation | null | undefined;
  text: string;
}

const PALETTE_HUES =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";
const PALETTE_CLASS = new RegExp(
  `(?:^|:)(?:bg|text|border|ring|outline|fill|stroke|decoration|from|via|to)-(?:${PALETTE_HUES})-(?:50|[1-9]00|950)(?:/\\d{1,3})?$`,
  "u",
);
const ARBITRARY_FONT_SIZE = /(?:^|:)text-\[(?:-?\d+(?:\.\d+)?(?:px|rem|em|pt)|length:[^\]]+)\]$/u;

// Walks the static parts of a class expression. Identifiers, member access, & other dynamic
// values yield runtime strings the rule can't see, so they're skipped.
function* classTextIn(expression: Expression): Generator<ClassText> {
  if (expression.type === "Literal") {
    if (typeof expression.value === "string") {
      yield { loc: expression.loc, text: expression.value };
    }
  } else if (expression.type === "TemplateLiteral") {
    for (const quasi of expression.quasis) {
      yield { loc: quasi.loc, text: quasi.value.cooked ?? "" };
    }
  } else if (expression.type === "ConditionalExpression") {
    yield* classTextIn(expression.consequent);
    yield* classTextIn(expression.alternate);
  } else if (expression.type === "LogicalExpression" || expression.type === "BinaryExpression") {
    if (expression.left.type !== "PrivateIdentifier") yield* classTextIn(expression.left);
    yield* classTextIn(expression.right);
  } else if (expression.type === "CallExpression") {
    for (const argument of expression.arguments) {
      yield* classTextIn(argument.type === "SpreadElement" ? argument.argument : argument);
    }
  } else if (expression.type === "ArrayExpression") {
    for (const element of expression.elements) {
      if (element) {
        yield* classTextIn(element.type === "SpreadElement" ? element.argument : element);
      }
    }
  } else if (expression.type === "ObjectExpression") {
    // In `cn({ "text-red-700": danger })`, the keys are the classes; the values are conditions.
    for (const property of expression.properties) {
      if (property.type === "Property" && property.key.type === "Literal") {
        yield* classTextIn(property.key);
      }
    }
  }
}

function classMessageId(className: string): string | undefined {
  if (ARBITRARY_FONT_SIZE.test(className)) return "arbitraryFontSize";
  if (PALETTE_CLASS.test(className)) return "rawPaletteClass";
  return undefined;
}

function isSvelteAttribute(node: { type: string }): node is AST.SvelteAttribute {
  return node.type === "SvelteAttribute";
}

function isClassDirective(node: { type: string }): node is AST.SvelteClassDirective {
  return node.type === "SvelteDirective" && (node as AST.SvelteDirective).kind === "Class";
}

const rule: Rule.RuleModule = {
  create(context) {
    function reportClasses({ loc, text }: ClassText, fallback: Rule.Node): void {
      for (const className of text.split(/\s+/u)) {
        const messageId = className === "" ? undefined : classMessageId(className);
        if (!messageId) continue;
        const data = { className: JSON.stringify(className) };
        if (loc) {
          context.report({ data, loc, messageId });
        } else {
          context.report({ data, messageId, node: fallback });
        }
      }
    }

    return {
      SvelteAttribute(listenerNode: Rule.Node) {
        const node: { type: string } = listenerNode;
        if (!isSvelteAttribute(node) || node.key.name !== "class") return;
        for (const part of node.value) {
          if (part.type === "SvelteLiteral") {
            reportClasses({ loc: part.loc, text: part.value }, listenerNode);
          } else {
            for (const text of classTextIn(part.expression)) reportClasses(text, listenerNode);
          }
        }
      },
      SvelteDirective(listenerNode: Rule.Node) {
        const node: { type: string } = listenerNode;
        if (!isClassDirective(node)) return;
        reportClasses({ loc: node.key.loc, text: node.key.name.name }, listenerNode);
      },
    };
  },
  meta: {
    type: "problem",
    docs: { description: "require design tokens instead of raw palette or font-size classes" },
    messages: {
      arbitraryFontSize: "Arbitrary font size {{className}}; use a type-scale utility.",
      rawPaletteClass: "Raw palette class {{className}}; use a semantic design token.",
    },
    schema: [],
  },
};

export default rule;

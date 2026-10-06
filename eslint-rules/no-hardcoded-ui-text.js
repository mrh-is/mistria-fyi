// Flags literal English text in Svelte templates that should go through a Paraglide message
// (`m.someKey()`) instead. Catches UI chrome text only — see docs/localization.md for the
// game-data localization path, which this rule cannot see (it's a plain property access like
// `entity.name`, indistinguishable syntactically from any other field).
//
// Verbatim/technical content (<code>, <kbd>, <samp>, <pre>) is exempt: file paths, keyboard keys,
// and code snippets aren't translated. Proper nouns (product names, people's names) still get
// flagged and need an eslint-disable comment — there's no reliable syntactic way to tell "Fields
// of Mistria" apart from ordinary prose.

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

function isTranslatable(text) {
  const trimmed = text.trim();
  return trimmed.length > 0 && HAS_LETTER.test(trimmed);
}

// Translatable string literals that a mustache expression can render directly: `{"Hello"}`,
// `{cond ? "Yes" : "No"}`, `{value ?? "None"}`, and a template literal's static parts.
function* stringLiterals(expression) {
  switch (expression?.type) {
    case "Literal":
      if (typeof expression.value === "string" && isTranslatable(expression.value)) {
        yield { node: expression, text: expression.value };
      }
      break;
    case "TemplateLiteral":
      for (const quasi of expression.quasis) {
        const cooked = quasi.value.cooked ?? "";
        if (isTranslatable(cooked)) {
          yield { node: quasi, text: cooked };
        }
      }
      break;
    case "ConditionalExpression":
      yield* stringLiterals(expression.consequent);
      yield* stringLiterals(expression.alternate);
      break;
    case "LogicalExpression":
      yield* stringLiterals(expression.left);
      yield* stringLiterals(expression.right);
      break;
    default:
      break;
  }
}

function isAttributeLike(node) {
  return node?.type === "SvelteAttribute" || node?.type.endsWith("Directive");
}

const rule = {
  create(context) {
    function isExempt(node) {
      return context.sourceCode.getAncestors(node).some((ancestor) => {
        if (ancestor.type === "SvelteScriptElement" || ancestor.type === "SvelteStyleElement") {
          return true;
        }
        return (
          ancestor.type === "SvelteElement" &&
          ancestor.name?.type === "SvelteName" &&
          VERBATIM_ELEMENTS.has(ancestor.name.name)
        );
      });
    }

    return {
      SvelteAttribute(node) {
        const attrName = node.key?.name;
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
                messageId: "hardcodedAttribute",
                node: part,
              });
            }
          } else if (part.type === "SvelteMustacheTag") {
            for (const literal of stringLiterals(part.expression)) {
              context.report({
                data: { attribute: attrName, text: JSON.stringify(literal.text.trim()) },
                messageId: "hardcodedAttribute",
                node: literal.node,
              });
            }
          }
        }
      },
      SvelteMustacheTag(node) {
        // Attribute mustaches are handled by `SvelteAttribute`; directive values are code, not text.
        if (node.kind !== "text" || isAttributeLike(node.parent) || isExempt(node)) {
          return;
        }
        for (const literal of stringLiterals(node.expression)) {
          context.report({
            data: { text: JSON.stringify(literal.text.trim()) },
            messageId: "hardcodedText",
            node: literal.node,
          });
        }
      },
      SvelteText(node) {
        if (isExempt(node)) {
          return;
        }
        if (isTranslatable(node.value)) {
          context.report({
            data: { text: JSON.stringify(node.value.trim()) },
            messageId: "hardcodedText",
            node,
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

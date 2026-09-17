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
        if (node.value.length !== 1 || node.value[0].type !== "SvelteLiteral") {
          return;
        }
        const literal = node.value[0];
        if (isTranslatable(literal.value)) {
          context.report({
            data: { attribute: attrName, text: JSON.stringify(literal.value.trim()) },
            messageId: "hardcodedAttribute",
            node: literal,
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

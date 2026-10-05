// Flags raw route literals in Svelte `href` attributes. Internal links must go through
// `localizedHref(...)` (src/lib/utils/localized-href.ts), which resolves the deployed base path and
// adds the locale segment; a literal like `href="/about"` silently drops both.
//
// Replaces eslint-plugin-svelte's `no-navigation-without-resolve`, which needs type information to
// recognize `localizedHref()` and so flagged every localized link in this untyped ESLint setup.
// This rule is purely syntactic: a call, identifier, or member access counts as resolved. Literal
// text is flagged unless it's an external URL (`https:`, `mailto:`, `//host`), a fragment (`#id`),
// or a query on the current page (`?tab=x`), whether it stands alone, starts a template literal,
// starts a `+` concatenation, or is a branch of a conditional or logical expression.

import type { Rule } from "eslint";
import type { AST } from "svelte-eslint-parser";

type Expression = AST.SvelteMustacheTagText["expression"];

// Resource, document-base, and SVG reference links, not navigation.
const NON_NAVIGATION_ELEMENTS = new Set(["base", "image", "link", "use"]);

const SCHEME = /^[a-z][\d+.a-z-]*:/iu;

function isRawRoute(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  // A fragment or query keeps the current, already-localized path.
  if (trimmed.startsWith("#") || trimmed.startsWith("?")) return false;
  return !trimmed.startsWith("//") && !SCHEME.test(trimmed);
}

/** Returns the raw route literal an expression can evaluate to, if any. */
function rawRouteIn(expression: Expression): string | undefined {
  // `"/villagers/" + id`: the leftmost operand decides where the URL points.
  if (expression.type === "BinaryExpression" && expression.operator === "+") {
    return expression.left.type === "PrivateIdentifier" ? undefined : rawRouteIn(expression.left);
  }
  if (expression.type === "ConditionalExpression") {
    return rawRouteIn(expression.consequent) ?? rawRouteIn(expression.alternate);
  }
  if (expression.type === "LogicalExpression") {
    return rawRouteIn(expression.left) ?? rawRouteIn(expression.right);
  }
  if (expression.type === "Literal") {
    return typeof expression.value === "string" && isRawRoute(expression.value)
      ? expression.value
      : undefined;
  }
  if (expression.type === "TemplateLiteral") {
    const head = expression.quasis.at(0)?.value.cooked ?? "";
    return isRawRoute(head) ? head : undefined;
  }
  // Any other expression (a call, an identifier, a member access) counts as resolved.
  return undefined;
}

function rawRouteInValue(value: AST.SvelteAttribute["value"]): string | undefined {
  const first = value.at(0);
  if (first === undefined) return undefined;
  if (first.type === "SvelteLiteral") {
    return isRawRoute(first.value) ? first.value : undefined;
  }
  return value.length > 1 ? undefined : rawRouteIn(first.expression);
}

function elementName(attribute: AST.SvelteAttribute): string | undefined {
  const element = attribute.parent.parent;
  return element.name.type === "SvelteName" ? element.name.name : undefined;
}

// ESLint's listener types only know ESTree nodes; svelte-eslint-parser adds the Svelte ones.
function isSvelteAttribute(node: { type: string }): node is AST.SvelteAttribute {
  return node.type === "SvelteAttribute";
}

const rule: Rule.RuleModule = {
  create(context) {
    return {
      SvelteAttribute(listenerNode: Rule.Node) {
        // Widen first: narrowing an ESTree node to a Svelte node directly yields `never`.
        const node: { type: string } = listenerNode;
        if (!isSvelteAttribute(node) || node.key.name !== "href") return;
        const name = elementName(node);
        if (name !== undefined && NON_NAVIGATION_ELEMENTS.has(name)) return;
        const route = rawRouteInValue(node.value);
        if (route === undefined) return;
        context.report({
          data: { route: JSON.stringify(route.trim()) },
          // svelte-eslint-parser nodes carry the `loc` and `range` ESLint reports need.
          loc: node.loc,
          messageId: "rawInternalHref",
        });
      },
    };
  },
  meta: {
    type: "problem",
    docs: {
      description: "Require internal `href` values to go through `localizedHref()`.",
    },
    messages: {
      rawInternalHref:
        "Raw route {{route}} in `href`. Wrap it in `localizedHref(...)` so it carries the base path and locale.",
    },
    schema: [],
  },
};

export default rule;

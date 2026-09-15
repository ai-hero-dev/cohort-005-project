// A custom oxlint JS plugin rule.
//
// Flags two (or more) consecutive function parameters that share the same
// type — the classic "swap the arguments by accident" footgun:
//
//   removeOption(questionId: string, optionId: string)   // bad: same shape, easy to swap
//   removeOption({ questionId, optionId }: { questionId: string; optionId: string })  // good
//
// Docs: https://oxc.rs/docs/guide/usage/linter/writing-js-plugins

/** Turn a TS type-annotation node into a comparable signature string. */
function typeSignature(typeAnnotation) {
  const t = typeAnnotation && typeAnnotation.typeAnnotation;
  if (!t) return null;

  switch (t.type) {
    case "TSTypeReference":
      return t.typeName && t.typeName.name ? `ref:${t.typeName.name}` : null;
    case "TSLiteralType":
      return `literal:${JSON.stringify(t.literal && t.literal.value)}`;
    default:
      // Covers the keyword types we care about for this rule:
      // TSStringKeyword, TSNumberKeyword, TSBooleanKeyword, etc.
      return t.type;
  }
}

function checkParams(params, context) {
  for (let i = 0; i < params.length - 1; i++) {
    const a = params[i];
    const b = params[i + 1];

    // Only flag plain identifiers — a destructured object param
    // (the fix we want people to reach for) never trips this rule.
    if (a.type !== "Identifier" || b.type !== "Identifier") continue;

    const sigA = typeSignature(a.typeAnnotation);
    const sigB = typeSignature(b.typeAnnotation);

    if (sigA && sigA === sigB) {
      context.report({
        node: b,
        message:
          `"${a.name}" and "${b.name}" are consecutive parameters of the same type (${sigA}). ` +
          `A caller can swap them by accident and TypeScript won't catch it. ` +
          `Combine them into a single destructured object parameter instead.`,
      });
    }
  }
}

const rule = {
  create(context) {
    return {
      FunctionDeclaration(node) {
        checkParams(node.params, context);
      },
      FunctionExpression(node) {
        checkParams(node.params, context);
      },
      ArrowFunctionExpression(node) {
        checkParams(node.params, context);
      },
    };
  },
};

export default {
  meta: {
    name: "no-adjacent-same-type-params",
  },
  rules: {
    "no-adjacent-same-type-params": rule,
  },
};

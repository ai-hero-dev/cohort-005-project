// Number() turns bad input into a number that looks good: Number("") is 0,
// and an empty lessonId once opened lesson 0 for every learner. Request
// input goes through a zod schema instead, z.coerce.number().int(), which
// refuses it at the edge.

const FORM_NAMES = new Set(["formData", "form", "searchParams"]);

const isIdentifier = (node, names) =>
  node.type === "Identifier" && names.has(node.name);

// params.lessonId, params["lessonId"]
const isParam = (node) =>
  node.type === "MemberExpression" &&
  isIdentifier(node.object, new Set(["params"]));

// formData.get("quizId"), url.searchParams.get("page")
const isFormGet = (node) => {
  if (node.type !== "CallExpression") return false;
  const { callee } = node;
  if (callee.type !== "MemberExpression" || callee.computed) return false;
  if (callee.property.name !== "get" && callee.property.name !== "getAll") {
    return false;
  }
  const owner = callee.object;
  return (
    isIdentifier(owner, FORM_NAMES) ||
    (owner.type === "MemberExpression" &&
      !owner.computed &&
      owner.property.name === "searchParams")
  );
};

const noNumberCoercion = {
  meta: {
    type: "problem",
    messages: {
      coercion:
        'Parse request input with a zod schema (z.coerce.number().int()), not Number(): Number("") is 0. See CODING_STANDARDS.md, Parse untrusted input with a schema.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "Number"
        ) {
          return;
        }
        const [arg] = node.arguments;
        if (arg && (isParam(arg) || isFormGet(arg))) {
          context.report({ node, messageId: "coercion" });
        }
      },
    };
  },
};

export default {
  meta: { name: "input" },
  rules: { "no-number-coercion": noNumberCoercion },
};

// sql.raw() sends its argument to the database unescaped, so it only accepts
// string literals and template literals without ${}. Pass dynamic values
// through the sql`` template tag, which parameterizes them.

const isStaticString = (node) =>
  (node.type === "Literal" && typeof node.value === "string") ||
  (node.type === "TemplateLiteral" && node.expressions.length === 0);

const isSqlRaw = (callee) =>
  callee.type === "MemberExpression" &&
  !callee.computed &&
  callee.object.type === "Identifier" &&
  callee.object.name === "sql" &&
  callee.property.name === "raw";

const noDynamicSqlRaw = {
  meta: {
    type: "problem",
    messages: {
      dynamic:
        "sql.raw() only accepts a static string. Pass dynamic values through the sql`` template tag, which parameterizes them.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isSqlRaw(node.callee)) return;
        const [arg] = node.arguments;
        if (arg && isStaticString(arg)) return;
        context.report({ node: arg ?? node, messageId: "dynamic" });
      },
    };
  },
};

export default {
  meta: { name: "sql" },
  rules: { "no-dynamic-raw": noDynamicSqlRaw },
};

// A custom oxlint JS plugin rule.
//
// `app/routes.ts` registers every route by hand: a URL path, and the file
// that serves it. Nothing makes the two agree. TypeScript checks that the
// file exists and that the loader's params parse — it has no opinion at all
// about whether the path a visitor types matches the file's name.
//
// So the two drift. A route keeps working, at an address nobody links to.
//
// This rule reads the filename and works out the path it says it serves:
//
//   routes/courses.$slug.lessons.$lessonId.tsx  ->  courses/:slug/lessons/:lessonId
//   routes/api.switch-user.ts                   ->  api/switch-user
//
// and reports every `route()` entry where that disagrees with the path that
// is actually registered, or where the file is not on disk at all.
//
// Docs: https://oxc.rs/docs/guide/usage/linter/writing-js-plugins
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** The one file this rule has anything to say about. */
const ROUTE_CONFIG = "app/routes.ts";

/**
 * Turn a route module's filename into the URL path its name claims.
 *
 * React Router's own flat-routes convention: a dot is a path separator, and
 * a `$` prefix is a dynamic segment.
 */
function pathFromFilename(file) {
  const withoutDir = file.replace(/^routes\//, "");
  const withoutExtension = withoutDir.replace(/\.tsx?$/, "");

  return withoutExtension
    .split(".")
    .map((segment) =>
      segment.startsWith("$") ? `:${segment.slice(1)}` : segment
    )
    .join("/");
}

function stringLiteral(node) {
  return node && node.type === "Literal" && typeof node.value === "string"
    ? node.value
    : null;
}

const rule = {
  create(context) {
    const filename = context.physicalFilename ?? context.filename ?? "";

    // `index()` and `layout()` take no path, so there is nothing to compare.
    // Only `route(path, file)` entries are in scope.
    if (!filename.replace(/\\/g, "/").endsWith(ROUTE_CONFIG)) return {};

    const appDir = dirname(filename);

    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        if (node.callee.name !== "route") return;

        const registeredPath = stringLiteral(node.arguments[0]);
        const file = stringLiteral(node.arguments[1]);
        if (registeredPath === null || file === null) return;

        if (!existsSync(resolve(appDir, file))) {
          context.report({
            node: node.arguments[1],
            message:
              `"${file}" is registered at "${registeredPath}", but there is ` +
              `no such file under app/.`,
          });
          return;
        }

        const expected = pathFromFilename(file);
        if (expected !== registeredPath) {
          context.report({
            node: node.arguments[0],
            message:
              `"${file}" is registered at "${registeredPath}", but its name ` +
              `says "${expected}". Rename the file, or correct the path — ` +
              `whichever one is the lie.`,
          });
        }
      },
    };
  },
};

export default {
  meta: {
    name: "route-config",
  },
  rules: {
    "matches-filename": rule,
  },
};

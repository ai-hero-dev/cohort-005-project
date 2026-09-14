import { defineConfig, configDefaults } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      // Stryker copies the project into `.stryker-tmp` for each run. If a run
      // stops early, the directory stays. Without this pattern, `npm run test`
      // then finds each test two times and gives a count that is twice the
      // correct value. Stryker is not affected: in the sandbox, the copy is
      // the root, so no path contains this directory name.
      "**/.stryker-tmp/**",
    ],
  },
});

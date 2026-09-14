// @ts-check
//
// Stryker configuration. `scripts/mutate-diff.ts` starts every run and
// supplies the file list. See the "Verification checks" section of AGENTS.md
// for what the command does and how to read the result.
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "npm",
  testRunner: "vitest",
  vitest: {
    // Use the configuration of the project. The defaults of the runner do
    // not agree with it. See vitest.config.ts.
    configFile: "vitest.config.ts",
    // The vitest runner of Stryker usually limits the dry run to the
    // "related" tests, which it finds through the import graph of Vite. That
    // search finds nothing in this project, because of the path aliases. It
    // reports "Vitest failed to find test files related to mutated files",
    // and Stryker then concludes that the project has no tests. Set this
    // option to false, so that the runner starts the full suite instead.
    related: false,
  },
  // "json" writes the report to `reports/mutation/mutation.json`. This is the
  // same data as the HTML report, but an agent or `jq` can read it directly.
  reporters: ["clear-text", "progress", "html", "json"],
  // "perTest" and "all" both depend on the same `related` search as above,
  // which does not work here. "off" starts the full suite for each mutant.
  // Each mutant costs more, but the result is reliable. The file list keeps
  // the number of mutants small, which is what makes the command quick.
  coverageAnalysis: "off",
  // Incremental mode adds to the file list below; it does not replace it.
  // Each run is already small, so the usual cost of incremental mode, a slow
  // first run without a cache, does not apply. The gain: after you correct
  // one mutant, Stryker examines again only the mutants that your correction
  // can affect. The cache is a local file, and `.gitignore` excludes it.
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  // Keep this list empty. `scripts/mutate-diff.ts` supplies the files of the
  // current change through `--mutate` for each run.
  mutate: [],
  ignorePatterns: [
    // NOTE: `ignorePatterns` controls which files Stryker copies into the
    // sandbox. It does not control which files Stryker mutates; `mutate` and
    // `--mutate` control that. Keep test files out of this list, or Stryker
    // has no tests to start. Exclude only files that the sandbox never needs.
    //
    // .claude/skills is a symbolic link to a directory. The sandbox copy of
    // Stryker cannot copy a directory with copyFile(), and it stops with an
    // EISDIR error if this pattern is absent.
    ".claude/**",
    ".agents/**",
  ],
  tempDirName: ".stryker-tmp",
};

export default config;

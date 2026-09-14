// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "npm",
  testRunner: "vitest",
  vitest: {
    // Point Stryker's vitest runner at the project's own config, rather
    // than letting it assume defaults that don't match (tsconfig-paths,
    // globals, etc — see vitest.config.ts).
    configFile: "vitest.config.ts",
    // Stryker's vitest runner tries to narrow the dry run to "related"
    // tests via Vite's import graph by default, which came back empty here
    // ("Vitest failed to find test files related to mutated files") and
    // made Stryker think the project has no tests at all. Disabling it
    // just runs the real suite instead — the `off` coverageAnalysis above
    // already accepts that trade (whole suite per mutant, not a filtered one).
    related: false,
  },
  reporters: ["clear-text", "progress", "html"],
  // "perTest"/"all" both lean on Vitest's `related` (import-graph) test
  // filtering to skip tests that can't possibly cover a given mutant — which
  // failed to resolve any related tests against this project's path-alias
  // setup ("Vitest failed to find test files related to mutated files").
  // "off" just reruns the whole suite per mutant instead. Slower per mutant,
  // but reliable, and the point of scoping to a diff is to keep the mutant
  // *count* small — a handful of mutants against the full suite is still a
  // "run it and watch" command, not a batch job.
  coverageAnalysis: "off",
  // Deliberately NOT mutating the whole `app/` tree here — a full-suite run
  // against ~11 service files takes long enough to be a "come back later"
  // command, not something you run to get a feel for a change. `mutate` is
  // left empty on purpose: `scripts/mutate-diff.ts` fills it in per run with
  // only the files a diff actually touched, and passes them via `--mutate`.
  mutate: [],
  ignorePatterns: [
    // NOTE: `ignorePatterns` controls what's copied into the sandbox at
    // all, not just what gets mutated (mutation candidates are controlled
    // by `mutate` / `--mutate` alone). Test files must stay OUT of this
    // list, or Stryker has nothing to run against — only exclude things
    // that are genuinely never needed inside the sandbox.
    // .claude/skills is a symlink to a directory — Stryker's sandbox copy
    // can't copyFile() a directory and crashes (EISDIR) if this isn't
    // excluded.
    ".claude/**",
    ".agents/**",
  ],
  tempDirName: ".stryker-tmp",
};

export default config;

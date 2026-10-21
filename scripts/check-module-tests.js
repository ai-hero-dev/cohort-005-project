// Fails when a module in app/modules/ has no tests. A module is a deep
// module: its tests, through its entry points, are how a change to its
// internals stays safe. See app/modules/README.md.
// Usage: node scripts/check-module-tests.js

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MODULES = "app/modules";
const isTest = (file) => /\.test\.tsx?$/.test(file);

const untested = readdirSync(MODULES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => {
    const tests = join(MODULES, name, "tests");
    return !existsSync(tests) || !readdirSync(tests).some(isTest);
  });

if (untested.length > 0) {
  console.error("These modules have no tests:\n");
  for (const name of untested) console.error(`  ${MODULES}/${name}/`);
  console.error(`
Add a tests/ folder with at least one *.test.ts. Tests import the module
through its entry points and arrange their data through the module's own
functions. A module that reads the database exports a create<Name>(db)
factory, as instructor-analytics does, and its tests pass createTestDb()
from ~/test/setup. See app/modules/README.md.`);
  process.exit(1);
}

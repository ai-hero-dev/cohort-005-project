import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// npm only runs the install scripts listed in package.json `allowScripts`.
// A package with an install script that is missing from the list installs
// without its build step: better-sqlite3 then fails at runtime with
// "Could not locate the bindings file". Every exact name@version in the
// lockfile that has an install script must be on the list.

const lockfileSchema = z.object({
  packages: z.record(
    z.object({
      name: z.string().optional(),
      version: z.string().optional(),
      hasInstallScript: z.boolean().optional(),
    })
  ),
});

const packageJsonSchema = z.object({
  allowScripts: z.record(z.boolean()),
});

function readJson(path: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  );
}

function packagesWithInstallScripts() {
  const lockfile = lockfileSchema.parse(readJson("package-lock.json"));
  const specs = Object.entries(lockfile.packages)
    .filter(([, entry]) => entry.hasInstallScript)
    .map(([path, entry]) => {
      const name = entry.name ?? path.split("node_modules/").at(-1);
      return `${name}@${entry.version}`;
    });
  return [...new Set(specs)].sort();
}

describe("allowScripts", () => {
  it("lists every lockfile package that has an install script", () => {
    const { allowScripts } = packageJsonSchema.parse(readJson("package.json"));
    const missing = packagesWithInstallScripts().filter(
      (spec) => allowScripts[spec] !== true
    );
    expect(missing).toEqual([]);
  });
});

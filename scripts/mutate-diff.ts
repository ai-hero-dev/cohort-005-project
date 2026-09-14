/**
 * Diff-based mutation testing.
 *
 * A full `stryker run` against every service in `app/services/` takes long
 * enough that nobody — student or agent — actually runs it to "see if this
 * change is any good." This script scopes Stryker down to just the `.ts`
 * files a change has actually touched, so a single `npm run test:mutation`
 * finishes fast enough to sit in a normal verification loop, not a
 * come-back-later batch job.
 *
 * "Touched" means: committed on this branch since it diverged from `main`,
 * OR sitting uncommitted (staged, unstaged, or a new untracked file) in the
 * working tree right now. That covers both "I finished a PR, mutate what's
 * in it" and "I'm mid-change, mutate what I'm looking at."
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";

function git(args: string[]): string[] {
  try {
    return execFileSync("git", args, { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function findMergeBase(): string | null {
  // Prefer diffing against the real upstream if this clone has it fetched;
  // fall back to a local `main` branch; give up gracefully otherwise (e.g.
  // a shallow clone with no `main` ref at all — everything just falls back
  // to "uncommitted changes only", which still works).
  for (const ref of ["origin/main", "main"]) {
    try {
      execFileSync("git", ["rev-parse", "--verify", ref], {
        stdio: "ignore",
      });
      return execFileSync("git", ["merge-base", "HEAD", ref], {
        encoding: "utf8",
      }).trim();
    } catch {
      continue;
    }
  }
  return null;
}

function changedFiles(): string[] {
  const mergeBase = findMergeBase();
  const committed = mergeBase ? git(["diff", "--name-only", mergeBase]) : [];
  const unstaged = git(["diff", "--name-only"]);
  const staged = git(["diff", "--name-only", "--cached"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);

  const all = new Set([...committed, ...unstaged, ...staged, ...untracked]);

  return [...all]
    .filter((file) => file.startsWith("app/"))
    .filter((file) => /\.tsx?$/.test(file))
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .filter((file) => existsSync(file)); // drop deletions
}

const files = changedFiles();

if (files.length === 0) {
  console.log(
    "No changed app/ source files found (checked against origin/main " +
      "or main, plus anything uncommitted). Nothing to mutate.\n" +
      "Touch a file under app/services/ (or anywhere else under app/) and run this again.",
  );
  process.exit(0);
}

console.log(`Diff-based mutation testing against ${files.length} file(s):`);
for (const file of files) console.log(`  - ${file}`);
console.log();

execSync(`npx stryker run --mutate ${files.join(",")}`, {
  stdio: "inherit",
});

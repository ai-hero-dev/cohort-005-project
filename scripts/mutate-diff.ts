/**
 * Diff-based mutation testing.
 *
 * This script limits Stryker to the files that a change touches. A full run
 * against the whole repository is too slow to use in a normal verification
 * loop.
 *
 * A file is "touched" if one of these is true:
 * - A commit changed it after your diff base: the commit you last reset to
 *   with `npm run reset <slug>`, not `main`. See `findDiffBase` below.
 * - It is staged, unstaged, or untracked in the work tree now.
 *
 * You can also name the files or directories yourself, which skips the diff:
 *
 *     npm run test:mutation -- app/lib/analytics.ts
 *     npm run test:mutation -- app/lib
 *
 * See the "Verification checks" section of AGENTS.md for how to read the
 * result.
 */
import { execFileSync } from "node:child_process";
import { existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The top of the repository.
 *
 * Git reports each path from this directory, but `existsSync` resolves a
 * relative path from the current directory. Resolve every path against this
 * value. If you do not, a run from a subdirectory finds no files and reports
 * "nothing to mutate", which is a false pass.
 */
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/**
 * The directories that hold code a test reaches.
 *
 * A mutant only says something about the suite if a test runs the line it
 * changes. Everywhere else, every mutant comes back `NoCoverage`, which you
 * already knew, and the run costs minutes to tell you.
 *
 * Today that is `app/lib/`, `app/modules/` and `request-logger/`. The route
 * modules still hold most of the queries and the rules, and no test imports
 * one of them — a loader needs a `Request` and a database. That is a real
 * gap, and mutation testing is not the tool that closes it: write the test
 * first, then grade it here.
 */
const TESTED_ROOTS = ["app/lib/", "app/modules/", "request-logger/"];

function git(args: string[]): string[] {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * The commit that "your diff" is measured from.
 *
 * After `npm run reset <slug>`, your branch holds `main` plus every lesson
 * commit up to that slug. A diff against `main` holds all of those lessons, so
 * it is the wrong base. The right base is the commit you reset to: everything
 * after it, committed or not, is yours.
 *
 * `npm run reset` does a `git reset`, so the base is the last reset (or branch
 * creation) in the reflog of the current branch, if HEAD still contains it.
 * If not, it is the merge base with `origin/main`, then with `main`. A clone
 * with neither gets null. The script then examines only the uncommitted
 * changes, which is still a usable result.
 */
function findDiffBase(): string | null {
  const branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"])[0];
  const reflog = git([
    "reflog",
    "show",
    "--format=%H%x09%gs",
    branch ? `refs/heads/${branch}` : "HEAD",
  ]);
  for (const line of reflog) {
    const [sha, subject = ""] = line.split("\t");
    const isStart =
      subject.startsWith("reset: moving to") ||
      subject.startsWith("branch: Created from");
    if (!sha || !isStart) continue;
    // A reset that HEAD has since moved away from (a rebase, say) is no
    // longer the start of your work. Stop looking, and use the merge base.
    if (isAncestorOfHead(sha)) return sha;
    break;
  }

  for (const ref of ["origin/main", "main"]) {
    const [sha] = git(["merge-base", "HEAD", ref]);
    if (sha) return sha;
  }
  return null;
}

function isAncestorOfHead(sha: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function isSource(file: string): boolean {
  return /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file);
}

function isTested(file: string): boolean {
  return TESTED_ROOTS.some((root) => file.startsWith(root));
}

/** Every source file below a directory, as a path from the repository root. */
function walk(dir: string): string[] {
  const absolute = resolve(repoRoot, dir);
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) return walk(child);
    return isSource(child) ? [child] : [];
  });
}

/** The files the arguments name, with a directory expanded to its contents. */
function namedFiles(args: string[]): string[] {
  return args.flatMap((arg) => {
    const absolute = resolve(repoRoot, arg);
    if (!existsSync(absolute)) {
      console.error(`No such file or directory: ${arg}`);
      process.exit(1);
    }
    return statSync(absolute).isDirectory() ? walk(arg) : [arg];
  });
}

function changedFiles(): string[] {
  const base = findDiffBase();
  console.log(`Diffing against ${base ? base.slice(0, 7) : "nothing"}.\n`);
  const committed = base ? git(["diff", "--name-only", base]) : [];
  const unstaged = git(["diff", "--name-only"]);
  const staged = git(["diff", "--name-only", "--cached"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);

  const all = new Set([...committed, ...unstaged, ...staged, ...untracked]);

  return [...all].filter((file) => existsSync(resolve(repoRoot, file))); // drop deletions
}

const args = process.argv.slice(2);
const fromDiff = args.length === 0;
const candidates = fromDiff ? changedFiles() : namedFiles(args);

const files = candidates.filter(isSource).filter(isTested).sort();

if (files.length === 0) {
  console.log(
    fromDiff
      ? "No changed files below " +
          TESTED_ROOTS.join(" or ") +
          ". There is nothing worth mutating.\n" +
          "Change a file in one of those directories, or name what to " +
          "mutate yourself:\n\n" +
          "  npm run test:mutation -- app/lib\n"
      : "Nothing to mutate. " +
          `Mutation testing here covers ${TESTED_ROOTS.join(" and ")} only — ` +
          "see the comment on TESTED_ROOTS in this file.\n"
  );
  process.exit(0);
}

console.log(`Mutation testing against ${files.length} file(s):`);
for (const file of files) console.log(`  - ${file}`);
console.log();

// Pass the file list as one argument, not through a shell. A path that
// contains a space or a shell character must not change the command.
try {
  execFileSync("npx", ["stryker", "run", "--mutate", files.join(",")], {
    cwd: repoRoot,
    stdio: "inherit",
  });
} catch (error) {
  const status = (error as { status?: number }).status;
  process.exit(typeof status === "number" ? status : 1);
}

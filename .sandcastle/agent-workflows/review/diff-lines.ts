// The lines GitHub accepts an inline review comment on: every line in a hunk
// of the diff, on the new side, per file. A review with one comment outside
// the hunks is rejected whole, so the workflow drops those comments first.
export const diffLines = (diff: string): Map<string, Set<number>> => {
  const files = new Map<string, Set<number>>();
  let inHeader = false;
  let lines: Set<number> | undefined;
  let next = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      inHeader = true;
      lines = undefined;
      continue;
    }
    if (inHeader) {
      if (line.startsWith("+++ b/")) {
        lines = new Set();
        files.set(line.slice("+++ b/".length), lines);
      }
      if (!line.startsWith("@@")) continue;
      inHeader = false;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      next = Number(hunk[1]);
      continue;
    }
    if (lines && (line.startsWith("+") || line.startsWith(" "))) {
      lines.add(next);
      next++;
    }
  }

  return files;
};

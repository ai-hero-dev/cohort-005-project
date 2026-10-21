import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import type { z } from "zod/v4";
import { claudeAgent, required, writeJson } from "../shared/common";
import { extractionPrompt } from "../shared/extraction-prompt";
import { runWithExtraction } from "../shared/run-with-extraction";
import { diffLines } from "./diff-lines";
import { addLeftFindings } from "./left-findings";
import { reviewSchema } from "./review-schema";

const BASE_REF = required("BASE_REF");
const VERDICT = "/tmp/review-verdict.md";

// The agent fixes and commits, writes the verdict file, and hands back the
// findings it left. This script lists those findings in the verdict. The
// workflow pushes the commits, posts the verdict and the inline comments,
// and marks the PR ready.
const result = await runWithExtraction({
  name: "review",
  agent: claudeAgent(),
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  promptFile: path.join(import.meta.dirname, "prompt.md"),
  promptArgs: {
    PR_NUMBER: required("PR_NUMBER"),
    BRANCH: required("BRANCH"),
    BASE_REF,
  },
  output: sandcastle.Output.object({ tag: "comments", schema: reviewSchema }),
  extractionPrompt: extractionPrompt("comments", reviewSchema),
});

const git = (...args: string[]): string =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// The diff after the agent's commits: the comments land on that.
const hunks = diffLines(git("diff", `origin/${BASE_REF}...HEAD`));
const { comments: found }: z.infer<typeof reviewSchema> = result.output;
const inDiff = ({ path: file, line }: { path: string; line: number }) =>
  hunks.get(file)?.has(line) ?? false;
const posted = found.filter(inDiff);
const dropped = found.filter((comment) => !inDiff(comment));
for (const { path: file, line } of dropped) {
  console.error(
    `${file}:${line} is not in the diff: the finding goes in the verdict.`
  );
}

// With no verdict, the findings still need a home. No `## Standards:`
// heading, so the workflow leaves the PR a draft.
const verdict = fs.existsSync(VERDICT)
  ? fs.readFileSync(VERDICT, "utf8")
  : "The review run produced no verdict. See the logs. Re-add `agent:review` to retry.\n";
fs.writeFileSync(VERDICT, addLeftFindings(verdict, posted, dropped));

// The request body for POST /repos/{owner}/{repo}/pulls/{n}/reviews.
writeJson("review-comments.json", {
  commit_id: git("rev-parse", "HEAD").trim(),
  event: "COMMENT",
  body: "The findings this review left for you, on their lines. The verdict is in its own comment.",
  comments: posted.map(({ path: file, line, body }) => ({
    path: file,
    line,
    body,
    side: "RIGHT",
  })),
});

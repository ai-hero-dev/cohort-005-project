import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { claudeAgent, required, writeJson } from "../shared/common";
import { extractionPrompt } from "../shared/extraction-prompt";
import { runWithExtraction } from "../shared/run-with-extraction";
import { updateBranchSchema } from "./update-branch-schema";

// Runs only when the merge conflicted. The agent resolves and stages; the
// workflow checks nothing is left, commits the merge and pushes it.
const result = await runWithExtraction({
  name: "update-branch",
  agent: claudeAgent(),
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  promptFile: path.join(import.meta.dirname, "prompt.md"),
  promptArgs: {
    BRANCH: required("BRANCH"),
    BASE_REF: required("BASE_REF"),
  },
  output: sandcastle.Output.object({
    tag: "report",
    schema: updateBranchSchema,
  }),
  extractionPrompt: extractionPrompt("report", updateBranchSchema),
});

writeJson("update-branch.json", result.output);

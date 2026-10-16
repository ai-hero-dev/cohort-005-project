import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { claudeAgent } from "../shared/common";

// Like the one-off implementer: the agent edits, the workflow commits and pushes.
await sandcastle.run({
  name: "build-ticket",
  agent: claudeAgent(),
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  promptFile: path.join(import.meta.dirname, "build-prompt.md"),
});

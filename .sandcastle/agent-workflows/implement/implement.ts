import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import { claudeAgent } from "../shared/common";

// The agent edits files. It does not commit, push or open the PR — the
// workflow steps after this one do, where you can read them.
await sandcastle.run({
  name: "implement",
  agent: claudeAgent(),
  sandbox: noSandbox(),
  logging: { type: "stdout" },
  promptFile: path.join(import.meta.dirname, "prompt.md"),
});

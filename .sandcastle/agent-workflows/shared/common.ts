import * as fs from "node:fs";
import * as path from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";

export const outputDir = (): string => process.env.OUTPUT_DIR ?? "/tmp";

export const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
};

export const writeJson = (filename: string, value: unknown): void => {
  fs.mkdirSync(outputDir(), { recursive: true });
  fs.writeFileSync(
    path.join(outputDir(), filename),
    JSON.stringify(value, null, 2)
  );
};

// The one agent every factory workflow runs. It authenticates with a Claude
// subscription. To bill the API instead, pass ANTHROPIC_API_KEY here and in
// the workflow's env in place of CLAUDE_CODE_OAUTH_TOKEN.
//
// Sandcastle runs every agent with its permission checks skipped, so it can
// use any tool. Claude Code also accepts `permissionMode: "auto"` here for
// AI-mediated approvals instead (Claude only; other agents don't offer it).
export const claudeAgent = () =>
  sandcastle.claudeCode("claude-opus-5-5", {
    env: {
      CLAUDE_CODE_OAUTH_TOKEN: required("CLAUDE_CODE_OAUTH_TOKEN"),
    },
  });

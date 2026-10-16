import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  run,
  type OutputObjectDefinition,
  type RunOptions,
  type RunResult,
} from "@ai-hero/sandcastle";

export type RunWithExtractionOptions<T> = Omit<RunOptions, "output"> & {
  readonly output: OutputObjectDefinition<T>;
  readonly extractionPrompt: string;
  /**
   * Extra attempts after the first if extraction or validation fails. Forwarded
   * to `Output`'s built-in `maxRetries`, which resumes the extraction session
   * and feeds back the error so the agent can re-emit a corrected tag.
   * Default: `2` (three attempts total). Ignored when the agent can't resume.
   */
  readonly maxRetries?: number;
};

// Two passes over one session. The first run does the work with the whole
// toolset. The second resumes that session and asks only for the structured
// output, so the answer is extracted from everything the first run read.
export async function runWithExtraction<T>(
  options: RunWithExtractionOptions<T>
): Promise<RunResult & { output: T }> {
  const {
    output,
    extractionPrompt,
    maxRetries = 2,
    ...produceOptions
  } = options;

  // Agents that can't resume a session (OpenCode) get no second pass and no
  // retries, so they emit the structured output at the end of the work itself.
  if (!produceOptions.agent.sessionStorage) {
    return run({
      ...produceOptions,
      ...appendToPrompt(produceOptions, extractionPrompt),
      output: { ...output, maxRetries: 0 },
    });
  }

  const produce = await run(produceOptions);
  const sessionId = produce.iterations.at(-1)?.sessionId;

  if (!sessionId) {
    throw new Error(
      "Cannot extract structured output because the produce run had no session id."
    );
  }

  const { promptArgs: _promptArgs, ...extractionOptions } = produceOptions;
  const extractionOutput: OutputObjectDefinition<T> = {
    ...output,
    maxRetries,
  };
  const extraction = await run({
    ...extractionOptions,
    name: produceOptions.name ? `${produceOptions.name} (extract)` : undefined,
    promptFile: undefined,
    prompt: extractionPrompt,
    resumeSession: sessionId,
    output: extractionOutput,
  });

  return { ...produce, output: extraction.output };
}

// A prompt file is copied with the instructions appended, so `promptArgs`
// substitution still applies to it.
const appendToPrompt = (
  options: Pick<RunOptions, "prompt" | "promptFile">,
  extractionPrompt: string
): Pick<RunOptions, "prompt" | "promptFile"> => {
  const suffix = [
    "",
    "",
    "When the task above is finished, write your final message as follows. These rules apply to that final message only.",
    "",
    extractionPrompt,
  ].join("\n");

  if (options.promptFile === undefined) {
    return { prompt: `${options.prompt ?? ""}${suffix}` };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-with-extraction-"));
  const promptFile = path.join(dir, path.basename(options.promptFile));
  fs.writeFileSync(
    promptFile,
    `${fs.readFileSync(options.promptFile, "utf8")}${suffix}`
  );
  return { promptFile };
};

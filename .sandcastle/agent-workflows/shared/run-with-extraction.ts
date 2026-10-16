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
   * Default: `2` (three attempts total).
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

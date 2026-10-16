import { z } from "zod/v4";

// The second pass of `runWithExtraction`. The schema is printed into the
// prompt as JSON Schema, descriptions and all, so the zod schema is the one
// place the shape of the answer is written down.
export const extractionPrompt = (tag: string, schema: z.ZodType): string =>
  [
    `Emit a single \`<${tag}>\` block as the last thing in your response. Inside it, put one JSON value that matches this JSON Schema:`,
    "",
    "```json",
    JSON.stringify(z.toJSONSchema(schema), null, 2),
    "```",
    "",
    "Do not change files.",
    "Do not run commands.",
    `Do not include text outside the \`<${tag}>\` block.`,
    "",
    `<${tag}>`,
    "{ ...the JSON value... }",
    `</${tag}>`,
  ].join("\n");

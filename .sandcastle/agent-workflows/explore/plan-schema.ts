import { z } from "zod/v4";

// The plan the explore run hands back. The apply job in agent-explore.yml
// checks the whole plan, then does what it says.
export const explorePlanSchema = z
  .strictObject({
    issues: z
      .array(
        z.strictObject({
          number: z.number().int().describe("The issue this entry is for."),
          duplicate_of: z
            .number()
            .int()
            .optional()
            .describe(
              "Only on a duplicate: the oldest issue in the batch it duplicates. That issue survives. Leave it out when this issue survives."
            ),
          comment: z
            .string()
            .min(1)
            .describe("The Markdown comment to post on the issue, as-is."),
        })
      )
      .describe("One entry per issue in the batch. Every issue exactly once."),
  })
  .describe("The explore plan.");

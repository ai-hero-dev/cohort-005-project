import { z } from "zod/v4";

// What the update-branch run hands back. The workflow posts `comment` on the
// pull request as-is.
export const updateBranchSchema = z
  .strictObject({
    comment: z
      .string()
      .min(1)
      .describe(
        "The Markdown comment to post on the pull request. Name each file that conflicted, say how you resolved it and why, and flag every call you were unsure of and anything `npm run check` still reports. Write it so the author can spot a bad call in thirty seconds."
      ),
  })
  .describe("Update-branch report: the comment for the pull request.");

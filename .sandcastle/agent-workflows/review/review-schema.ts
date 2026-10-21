import { z } from "zod/v4";

// The findings the review left unfixed. The workflow posts each one as an
// inline comment on the pull request, on its file and line, and lists it by
// title in the verdict.
export const reviewSchema = z
  .strictObject({
    comments: z
      .array(
        z.strictObject({
          axis: z
            .enum(["standards", "spec"])
            .describe("The verdict section the finding belongs to."),
          title: z
            .string()
            .min(1)
            .describe(
              "The finding in a few words, plain text, e.g. 'Server module imports a UI component'."
            ),
          path: z
            .string()
            .min(1)
            .describe("The file, relative to the repository root."),
          line: z
            .number()
            .int()
            .positive()
            .describe(
              "A line in the file as it is now, inside a hunk of the diff against the base. A comment outside the hunks goes into the verdict instead."
            ),
          body: z
            .string()
            .min(1)
            .describe(
              "The finding, in Markdown: the rule or spec line it breaks, why it could not be fixed here, and what to do instead."
            ),
        })
      )
      .describe(
        "One entry per finding you left unfixed, on the first line it concerns. Empty is fine."
      ),
  })
  .describe("The review's inline comments.");

export type ReviewComment = z.infer<typeof reviewSchema>["comments"][number];

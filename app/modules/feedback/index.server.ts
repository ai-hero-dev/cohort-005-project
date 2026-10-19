import { fileFeedbackIssue, type FeedbackDeps } from "./lib/feedback";
import { runCommand } from "./lib/run-command.server";

export type { RunCommand } from "./lib/feedback";

/**
 * The feedback entry point. The app uses `feedback`, which is live only
 * under `npm run dev` and runs the real `git` and `gh`; tests build their own
 * with a fake `run`.
 */
export function createFeedback(deps: FeedbackDeps) {
  return {
    /**
     * Files the posted form (title, description, page) as an issue on
     * origin's GitHub repo with `gh issue create`, signed in as whoever ran
     * `gh auth login`. Returns the new issue's URL. Throws 404 outside dev,
     * 400 for an empty title or description, and 500 when origin is not on
     * GitHub.
     */
    async fileIssue(request: Request) {
      return fileFeedbackIssue(deps, await request.formData());
    },
  };
}

export const feedback = createFeedback({
  isDev: import.meta.env.DEV,
  run: runCommand,
});

// The five conditions, as the numbers they are counted in. Private: a caller
// asks the Policy for a decision, not for a threshold.

/** More than this share of the Course finished and the Refund is refused. */
export const MAX_COMPLETED_SHARE = 0.5;

/** Two hours, in seconds. */
export const MAX_WATCHED_SECONDS = 2 * 60 * 60;

export function completedShare(
  completedLessonCount: number,
  lessonCount: number
): number {
  // A Course with no Lessons cannot have been half finished.
  return lessonCount === 0 ? 0 : completedLessonCount / lessonCount;
}
